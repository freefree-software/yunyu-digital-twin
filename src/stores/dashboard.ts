import { computed, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import { loadBusinessData, loadCampusScene, loadTracks } from '@/data/campus'
import { buildRoadGraph, findRoadRoute, polylineLengthKm, type RoadGraph } from '@/services/route'
import { MockRealtimeLink, type RealtimeHandlers } from '@/services/mockRealtime'
import { formatSeconds, toSeconds } from '@/utils/time'
import type {
  AlertItem,
  AlertStatus,
  Building,
  CampusSceneData,
  CampusStats,
  CameraPoint,
  DashboardMode,
  Device,
  DeviceStatus,
  DeviceSummary,
  DisposalRecord,
  DisposalStage,
  EffectState,
  LayerKey,
  QualityLevel,
  RealtimeState,
  ResourceItem,
  RoutePath,
  SceneMetrics,
  TourState,
  TourStep,
  TrackMeta,
  TrackPoint,
  TrendData,
  ViewLevel,
} from '@/types/domain'

const initialLayers: Record<LayerKey, boolean> = {
  imagery: true,
  buildings: true,
  surroundings: true,
  devices: true,
  alerts: true,
  poi: true,
}

export const VIEW_LEVELS: Array<{ key: ViewLevel; label: string }> = [
  { key: 'district', label: '片区全景' },
  { key: 'campus', label: '园区总览' },
  { key: 'building', label: '楼栋近景' },
]

export const DISPOSAL_STEPS: Array<{ stage: DisposalStage; label: string; action: string }> = [
  { stage: 0, label: '接警', action: '确认警情' },
  { stage: 1, label: '确认', action: '调派资源' },
  { stage: 2, label: '派发', action: '资源到场' },
  { stage: 3, label: '到场', action: '现场处理' },
  { stage: 4, label: '处理', action: '归档结案' },
  { stage: 5, label: '归档', action: '已完成' },
]

const TREND_BINS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00']
const PLAY_DURATION = 26000

function nowText(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

function distanceKm(a: [number, number], b: [number, number]): number {
  return Math.hypot((a[0] - b[0]) * 90000, (a[1] - b[1]) * 111000) / 1000
}

export const useDashboardStore = defineStore('dashboard', () => {
  const scene = shallowRef<CampusSceneData | null>(null)
  const buildings = ref<Building[]>([])
  const devices = ref<Device[]>([])
  const alerts = ref<AlertItem[]>([])
  const resources = ref<ResourceItem[]>([])
  const loadError = ref<string | null>(null)
  const roadGraphRef = shallowRef<RoadGraph | null>(null)

  const activeMode = ref<DashboardMode>('overview')
  const layers = ref<Record<LayerKey, boolean>>({ ...initialLayers })
  const viewLevel = ref<ViewLevel>('campus')
  const selectedBuildingId = ref<string | null>(null)

  // ------------------------------------------------------------ 拾取与信息卡
  const selectedDeviceId = ref<string | null>(null)
  const selectedAlertId = ref<string | null>(null)

  const selectedBuilding = computed<Building | null>(
    () => buildings.value.find((item) => item.id === selectedBuildingId.value) ?? null,
  )
  const selectedDevice = computed<Device | null>(
    () => devices.value.find((item) => item.id === selectedDeviceId.value) ?? null,
  )
  const selectedAlert = computed<AlertItem | null>(
    () => alerts.value.find((item) => item.id === selectedAlertId.value) ?? null,
  )
  const infoKind = computed<'building' | 'device' | null>(() => {
    if (selectedDevice.value) return 'device'
    return selectedBuilding.value ? 'building' : null
  })
  const buildingDevices = computed(() =>
    selectedBuildingId.value
      ? devices.value.filter((item) => item.buildingId === selectedBuildingId.value)
      : [],
  )

  // ------------------------------------------------------------ 处置闭环
  const disposalStage = ref<DisposalStage>(0)
  const disposalLog = ref<DisposalRecord[]>([])
  const autoDisposal = ref(false)
  const route = ref<RoutePath | null>(null)
  const routeArrived = ref(false)

  let autoTimer: number | undefined

  function stopAutoDisposal() {
    autoDisposal.value = false
    if (autoTimer) window.clearInterval(autoTimer)
    autoTimer = undefined
  }

  function pushLog(stage: DisposalStage, label: string, note: string) {
    disposalLog.value.push({ stage, label, time: nowText(), note })
  }

  function focusAlert(id: string) {
    const alert = alerts.value.find((item) => item.id === id)
    if (!alert) return
    stopAutoDisposal()
    selectedAlertId.value = alert.id
    selectedBuildingId.value = alert.buildingId
    selectedDeviceId.value = null
    viewLevel.value = 'building'
    activeMode.value = 'disposal'
    route.value = null
    routeArrived.value = false
    floorExpanded.value = false
    disposalLog.value = []
    disposalStage.value =
      alert.status === 'pending' ? 0 : alert.status === 'processing' ? 2 : 5
    if (alert.status === 'resolved') {
      pushLog(5, '归档', '该告警已完成处置')
    }
  }

  function nearestResource(): ResourceItem | null {
    const alert = selectedAlert.value
    if (!alert) return null
    let best: ResourceItem | null = null
    let bestDistance = Number.POSITIVE_INFINITY
    for (const resource of resources.value) {
      const d = distanceKm([alert.lon, alert.lat], [resource.lon, resource.lat])
      if (d < bestDistance) {
        bestDistance = d
        best = resource
      }
    }
    return best
  }

  function planRoute(resourceId: string) {
    const alert = selectedAlert.value
    const resource = resources.value.find((item) => item.id === resourceId)
    if (!alert || !resource) return
    const from: [number, number] = [alert.lon, alert.lat]
    const to: [number, number] = [resource.lon, resource.lat]
    const positions = roadGraphRef.value
      ? findRoadRoute(roadGraphRef.value, from, to)
      : [from, to]
    const km = polylineLengthKm(positions)
    routeArrived.value = false
    route.value = {
      resourceId: resource.id,
      resourceName: resource.name,
      positions,
      distanceKm: km,
      duration: Math.min(9000, Math.max(3500, km * 3200)),
    }
  }

  function completeRoute() {
    if (!route.value || routeArrived.value) return
    routeArrived.value = true
    if (disposalStage.value === 2) {
      disposalStage.value = 3
      pushLog(3, '到场', `${route.value.resourceName} 抵达现场`)
    }
  }

  function advanceDisposal() {
    const alert = selectedAlert.value
    if (!alert || disposalStage.value >= 5) return
    const next = (disposalStage.value + 1) as DisposalStage
    disposalStage.value = next
    if (next === 1) {
      alert.status = 'processing'
      pushLog(1, '确认', '值班员确认警情，转入处置流程')
    } else if (next === 2) {
      alert.status = 'processing'
      const resource = nearestResource()
      if (resource) {
        planRoute(resource.id)
        pushLog(2, '派发', `调派 ${resource.name}，生成园区路径`)
      } else {
        pushLog(2, '派发', '未找到可用资源，转人工调度')
      }
    } else if (next === 3) {
      routeArrived.value = true
      pushLog(3, '到场', route.value ? `${route.value.resourceName} 抵达现场` : '处置人员抵达现场')
    } else if (next === 4) {
      pushLog(4, '处理', '现场排查与处置，隐患消除')
    } else if (next === 5) {
      alert.status = 'resolved' as AlertStatus
      pushLog(5, '归档', '告警关闭，处置记录归档')
      route.value = null
      stopAutoDisposal()
    }
  }

  function toggleAutoDisposal() {
    if (autoDisposal.value) {
      stopAutoDisposal()
      return
    }
    if (!selectedAlert.value) return
    autoDisposal.value = true
    autoTimer = window.setInterval(() => {
      if (!selectedAlert.value || disposalStage.value >= 5) {
        stopAutoDisposal()
        return
      }
      advanceDisposal()
    }, 5000)
  }

  // ------------------------------------------------------------ Step 4：性能与特效
  const perfVisible = ref(false)
  const quality = ref<QualityLevel>('high')
  const effects = ref<EffectState>({ boundaryFlow: true, scan: true, heatmap: false })
  const metrics = ref<SceneMetrics>({ fps: 0, drawCalls: 0, triangles: 0, heapMB: 0 })
  const baselineFps = ref<number | null>(null)
  const baselineQuality = ref<QualityLevel | null>(null)
  const floorExpanded = ref(false)

  function togglePerf() {
    perfVisible.value = !perfVisible.value
  }

  function setQuality(level: QualityLevel) {
    quality.value = level
  }

  function toggleEffect(key: keyof EffectState) {
    effects.value[key] = !effects.value[key]
  }

  function setMetrics(next: SceneMetrics) {
    metrics.value = next
  }

  function recordBaseline() {
    baselineFps.value = metrics.value.fps
    baselineQuality.value = quality.value
  }

  function toggleFloor() {
    floorExpanded.value = !floorExpanded.value
  }

  // ------------------------------------------------------------ 图表联动筛选
  const trendHour = ref<number | null>(null)

  const trend = computed<TrendData>(() => ({
    times: TREND_BINS,
    values: TREND_BINS.map((label) => {
      const hour = Number(label.slice(0, 2))
      return alerts.value.filter((item) => Number(item.time.slice(0, 2)) === hour).length
    }),
  }))

  const filteredAlerts = computed(() =>
    trendHour.value === null
      ? alerts.value
      : alerts.value.filter((item) => Number(item.time.slice(0, 2)) === trendHour.value),
  )

  function setTrendHour(hour: number) {
    trendHour.value = trendHour.value === hour ? null : hour
  }

  // ------------------------------------------------------------ 轨迹回放
  const tracks = ref<TrackMeta[]>([])
  const trackPoints = shallowRef<Map<string, TrackPoint[]>>(new Map())
  const trackProgress = ref(0)
  const trackPlaying = ref(false)
  const trackVisible = ref(false)
  const selectedTrackId = ref<string | null>(null)

  const playbackWindow = computed(() => {
    let start = Number.POSITIVE_INFINITY
    let end = 0
    for (const meta of tracks.value) {
      const points = trackPoints.value.get(meta.id)
      if (!points?.length) continue
      start = Math.min(start, toSeconds(points[0].time))
      end = Math.max(end, toSeconds(points[points.length - 1].time))
    }
    if (!Number.isFinite(start) || end <= 0) return { start: 0, end: 1 }
    return { start, end }
  })

  const playbackTime = computed(() => {
    const { start, end } = playbackWindow.value
    return formatSeconds(start + (end - start) * trackProgress.value)
  })

  const activeTracks = computed(() =>
    selectedTrackId.value
      ? tracks.value.filter((item) => item.id === selectedTrackId.value)
      : tracks.value,
  )

  let rafId = 0
  let lastFrame = 0

  function loop(timestamp: number) {
    if (!trackPlaying.value) return
    if (!lastFrame) lastFrame = timestamp
    const delta = timestamp - lastFrame
    lastFrame = timestamp
    trackProgress.value = Math.min(1, trackProgress.value + delta / PLAY_DURATION)
    if (trackProgress.value >= 1) {
      trackPlaying.value = false
      trackVisible.value = true
      return
    }
    rafId = requestAnimationFrame(loop)
  }

  watch(trackPlaying, (playing) => {
    if (playing) {
      trackVisible.value = true
      lastFrame = 0
      cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(loop)
    } else {
      cancelAnimationFrame(rafId)
    }
  })

  function toggleTrackPlaying() {
    if (trackProgress.value >= 1) trackProgress.value = 0
    trackPlaying.value = !trackPlaying.value
  }

  function setTrackProgress(value: number) {
    trackProgress.value = Math.min(1, Math.max(0, value))
    trackVisible.value = true
  }

  function selectTrack(id: string | null) {
    selectedTrackId.value = id
  }

  // ------------------------------------------------------------ 模拟实时链路
  const realtime = ref<RealtimeState>({
    status: 'connected',
    pushes: 0,
    lastEvent: '',
    lastPushAt: 0,
    duplicateDropped: 0,
  })
  const deviceRevision = ref(0)

  let link: MockRealtimeLink | null = null
  let pushSeq = 0
  const seenAlertIds = new Set<string>()

  function nextRealtimeAlert(): AlertItem | null {
    if (!buildings.value.length) return null
    const keyBuildings = buildings.value.filter((item) => item.keyBuilding)
    const pool = keyBuildings.length ? keyBuildings : buildings.value
    const building = pool[Math.floor(Math.random() * pool.length)]
    const device = devices.value.find((item) => item.buildingId === building.id)
    const types = ['烟感报警', '配电温度偏高', '视频遮挡', '水浸告警']
    pushSeq += 1
    return {
      id: `A-R${String(pushSeq).padStart(3, '0')}`,
      time: nowText(),
      type: types[Math.floor(Math.random() * types.length)],
      level: Math.random() > 0.5 ? 'high' : 'medium',
      status: 'pending',
      buildingId: building.id,
      buildingName: building.name,
      deviceId: device?.id ?? `D-R${pushSeq}`,
      deviceName: device?.name ?? `${building.name} 感知设备`,
      lon: device?.lon ?? building.center[0],
      lat: device?.lat ?? building.center[1],
      pushed: true,
    }
  }

  function nextRealtimeDevice() {
    if (!devices.value.length) return null
    const device = devices.value[Math.floor(Math.random() * devices.value.length)]
    const statuses: DeviceStatus[] = ['normal', 'normal', 'normal', 'warning', 'offline']
    return {
      id: device.id,
      temperature: Math.round((device.temperature + (Math.random() - 0.5) * 3) * 10) / 10,
      current: Math.round((device.current + (Math.random() - 0.5) * 1.2) * 100) / 100,
      status: Math.random() > 0.7 ? statuses[Math.floor(Math.random() * statuses.length)] : device.status,
    }
  }

  const realtimeHandlers: RealtimeHandlers = {
    nextAlert: nextRealtimeAlert,
    nextDevice: nextRealtimeDevice,
    onStatus: (status) => {
      realtime.value.status = status
      realtime.value.lastEvent = status === 'connected' ? '链路已连接' : '链路中断，重连中'
    },
    onAlert: (alert) => {
      if (seenAlertIds.has(alert.id)) {
        realtime.value.duplicateDropped += 1
        return
      }
      seenAlertIds.add(alert.id)
      alerts.value = [alert, ...alerts.value].slice(0, 80)
      realtime.value.pushes += 1
      realtime.value.lastEvent = `${alert.buildingName} · ${alert.type}`
      realtime.value.lastPushAt = Date.now()
    },
    onDevice: (payload) => {
      const target = devices.value.find((item) => item.id === payload.id)
      if (!target) return
      target.temperature = payload.temperature
      target.current = payload.current
      if (target.status !== payload.status) {
        target.status = payload.status
        deviceRevision.value += 1
      }
      realtime.value.pushes += 1
      realtime.value.lastEvent = `${target.name} · ${payload.temperature}℃`
      realtime.value.lastPushAt = Date.now()
    },
  }

  function startRealtime() {
    if (link) return
    link = new MockRealtimeLink(realtimeHandlers)
    link.connect()
  }

  function simulateRealtimeDrop() {
    link?.drop()
  }

  // ------------------------------------------------------------ 基础派生
  const deviceSummary = computed<DeviceSummary>(() => ({
    normal: devices.value.filter((item) => item.status === 'normal').length,
    warning: devices.value.filter((item) => item.status === 'warning').length,
    offline: devices.value.filter((item) => item.status === 'offline').length,
  }))

  const onlineDevices = computed(() => deviceSummary.value.normal + deviceSummary.value.warning)
  const deviceTotal = computed(() => devices.value.length)
  const unresolvedAlerts = computed(() => alerts.value.filter((item) => item.status !== 'resolved'))
  const pendingAlertCount = computed(() => unresolvedAlerts.value.length)

  const stats = computed<CampusStats>(() => ({
    buildingCount: buildings.value.length,
    deviceCount: devices.value.length,
    onlineRate: deviceTotal.value ? (onlineDevices.value / deviceTotal.value) * 100 : 0,
    alertCount: pendingAlertCount.value,
  }))

  let loading: Promise<void> | null = null

  async function load() {
    if (loading) return loading
    loading = (async () => {
      try {
        const [sceneData, business, trackData] = await Promise.all([
          loadCampusScene(),
          loadBusinessData(),
          loadTracks(),
        ])
        scene.value = sceneData
        buildings.value = sceneData.buildings.features.map((feature) => feature.properties)
        devices.value = business.devices
        alerts.value = business.alerts
        for (const alert of business.alerts) seenAlertIds.add(alert.id)
        resources.value = sceneData.resources.features.map((feature) => ({
          id: feature.properties.id,
          name: feature.properties.name,
          type: feature.properties.type,
          distance: feature.properties.distanceKm,
          lon: feature.geometry.coordinates[0],
          lat: feature.geometry.coordinates[1],
        }))

        roadGraphRef.value = buildRoadGraph(sceneData.roads)

        tracks.value = trackData.tracks
        const grouped = new Map<string, TrackPoint[]>()
        for (const point of trackData.points) {
          const list = grouped.get(point.trackId)
          if (list) list.push(point)
          else grouped.set(point.trackId, [point])
        }
        for (const list of grouped.values()) list.sort((a, b) => a.seq - b.seq)
        trackPoints.value = grouped

        startRealtime()
      } catch (error) {
        loadError.value = error instanceof Error ? error.message : String(error)
        console.error('[dashboard] 数据加载失败', error)
      }
    })()
    return loading
  }

  function toggleLayer(key: LayerKey) {
    layers.value[key] = !layers.value[key]
  }

  // ------------------------------------------------------------ Step 5：搜索 / 视频点位 / 自动漫游
  const cameras = computed<CameraPoint[]>(() =>
    buildings.value
      .filter((item) => item.keyBuilding)
      .slice(0, 8)
      .map((building, index) => ({
        id: `CAM-${String(index + 1).padStart(3, '0')}`,
        name: `${building.name} ${['东侧', '南侧', '西侧', '北侧'][index % 4]}球机`,
        buildingId: building.id,
        buildingName: building.name,
        lon: building.center[0] + (index % 2 === 0 ? 0.00018 : -0.00018),
        lat: building.center[1] + (index % 3 === 0 ? 0.00014 : -0.00014),
        height: building.height + 5,
        online: index !== 6,
        resolution: index % 2 === 0 ? '1920×1080' : '2560×1440',
      })),
  )

  const selectedCameraId = ref<string | null>(null)
  const selectedCamera = computed(
    () => cameras.value.find((item) => item.id === selectedCameraId.value) ?? null,
  )

  function selectCamera(id: string | null) {
    selectedCameraId.value = id
  }

  function closeCamera() {
    selectedCameraId.value = null
  }

  const tourSteps: TourStep[] = [
    {
      key: 'district',
      title: '片区总览',
      desc: '从片区视角俯瞰园区与周边楼宇，边界高亮标识管理范围。',
      duration: 22,
    },
    {
      key: 'campus',
      title: '园区全貌',
      desc: '128 栋建筑白模、道路、水系与重点楼宇一览，图层随演示自动切换。',
      duration: 24,
    },
    {
      key: 'building',
      title: '重点楼栋下钻',
      desc: '相机飞向重点楼栋，查看楼层、面积、设备与告警分布。',
      duration: 26,
    },
    {
      key: 'alert',
      title: '告警定位与派发',
      desc: '告警触发后自动定位楼栋，楼体变色、脉冲提示，并完成确认与派发。',
      duration: 22,
    },
    {
      key: 'route',
      title: '资源调度路径',
      desc: '基于路网规划最近处置资源，车辆沿道路行进，抵达现场。',
      duration: 36,
    },
    {
      key: 'tracks',
      title: '轨迹回放',
      desc: '拖动时间轴回放人员与车辆轨迹，复盘当日园区运行状态。',
      duration: 34,
    },
    {
      key: 'finish',
      title: '返回总览',
      desc: '演示结束，园区回到片区总览视角，随时可再次播放。',
      duration: 16,
    },
  ]

  const tour = ref<TourState>({ active: false, step: 0, progress: 0 })
  let tourTimer: number | undefined
  let tourStepStartedAt = 0

  function applyTourStep(index: number) {
    const step = tourSteps[index]
    if (!step) return
    if (step.key === 'district') {
      stopAutoDisposal()
      clearInfo()
      setViewLevel('district')
    } else if (step.key === 'campus') {
      clearInfo()
      setViewLevel('campus')
    } else if (step.key === 'building') {
      const target = buildings.value.find((item) => item.keyBuilding)
      if (target) selectBuilding(target.id)
    } else if (step.key === 'alert') {
      const target =
        unresolvedAlerts.value.find((item) => item.status === 'pending') ?? unresolvedAlerts.value[0]
      if (target) {
        focusAlert(target.id)
        advanceDisposal()
        advanceDisposal()
      }
    } else if (step.key === 'route') {
      const resource = resources.value[0]
      if (selectedAlert.value && resource) planRoute(resource.id)
    } else if (step.key === 'tracks') {
      if (disposalStage.value < 5) {
        advanceDisposal()
        advanceDisposal()
        advanceDisposal()
      }
      if (!trackPlaying.value) {
        selectTrack(null)
        toggleTrackPlaying()
      }
    } else if (step.key === 'finish') {
      if (trackPlaying.value) toggleTrackPlaying()
      clearInfo()
      setViewLevel('district')
    }
  }

  function stopTour() {
    if (tourTimer) window.clearInterval(tourTimer)
    tourTimer = undefined
    if (!tour.value.active) return
    tour.value.active = false
    tour.value.progress = 0
    stopAutoDisposal()
    if (trackPlaying.value) toggleTrackPlaying()
    if (activeMode.value === 'tour') activeMode.value = 'overview'
  }

  function runTourStep(index: number) {
    tour.value.step = index
    tour.value.progress = 0
    tourStepStartedAt = performance.now()
    applyTourStep(index)
  }

  function nextTourStep() {
    const next = tour.value.step + 1
    if (next >= tourSteps.length) {
      stopTour()
      return
    }
    runTourStep(next)
  }

  function prevTourStep() {
    runTourStep(Math.max(0, tour.value.step - 1))
  }

  function jumpTourStep(index: number) {
    if (!tour.value.active) return
    runTourStep(Math.max(0, Math.min(tourSteps.length - 1, index)))
  }

  function startTour() {
    if (tour.value.active) {
      stopTour()
      return
    }
    activeMode.value = 'tour'
    tour.value.active = true
    tour.value.step = 0
    tour.value.progress = 0
    tourStepStartedAt = performance.now()
    applyTourStep(0)
    if (tourTimer) window.clearInterval(tourTimer)
    tourTimer = window.setInterval(() => {
      const step = tourSteps[tour.value.step]
      if (!step) return
      const elapsed = (performance.now() - tourStepStartedAt) / 1000
      tour.value.progress = Math.min(1, elapsed / step.duration)
      if (elapsed >= step.duration) nextTourStep()
    }, 120)
  }

  function setMode(mode: DashboardMode) {
    if (mode === 'tour') {
      startTour()
      return
    }
    if (tour.value.active) stopTour()
    activeMode.value = mode
  }

  function setViewLevel(level: ViewLevel) {
    if (level === 'building' && !selectedBuildingId.value) return
    if (level !== 'building') {
      selectedBuildingId.value = null
      selectedDeviceId.value = null
    }
    viewLevel.value = level
  }

  function selectBuilding(id: string | null) {
    stopAutoDisposal()
    selectedAlertId.value = null
    selectedDeviceId.value = null
    route.value = null
    routeArrived.value = false
    floorExpanded.value = false
    disposalStage.value = 0
    disposalLog.value = []
    selectedBuildingId.value = id
    if (id) viewLevel.value = 'building'
  }

  function selectDevice(id: string | null) {
    const device = devices.value.find((item) => item.id === id)
    if (!device) return
    selectedDeviceId.value = device.id
    selectedBuildingId.value = device.buildingId
    viewLevel.value = 'building'
  }

  function clearInfo() {
    selectedDeviceId.value = null
    selectedBuildingId.value = null
    viewLevel.value = 'campus'
  }

  return {
    scene,
    buildings,
    devices,
    alerts,
    resources,
    loadError,
    activeMode,
    layers,
    viewLevel,
    selectedBuildingId,
    selectedBuilding,
    selectedDeviceId,
    selectedDevice,
    selectedAlertId,
    selectedAlert,
    infoKind,
    buildingDevices,
    deviceSummary,
    onlineDevices,
    deviceTotal,
    unresolvedAlerts,
    pendingAlertCount,
    filteredAlerts,
    trendHour,
    stats,
    trend,
    disposalStage,
    disposalLog,
    autoDisposal,
    route,
    routeArrived,
    tracks,
    trackPoints,
    trackProgress,
    trackPlaying,
    trackVisible,
    selectedTrackId,
    playbackWindow,
    playbackTime,
    activeTracks,
    realtime,
    deviceRevision,
    load,
    toggleLayer,
    setMode,
    setViewLevel,
    selectBuilding,
    selectDevice,
    clearInfo,
    focusAlert,
    planRoute,
    advanceDisposal,
    toggleAutoDisposal,
    stopAutoDisposal,
    completeRoute,
    setTrendHour,
    toggleTrackPlaying,
    setTrackProgress,
    selectTrack,
    simulateRealtimeDrop,
    perfVisible,
    quality,
    effects,
    metrics,
    baselineFps,
    baselineQuality,
    floorExpanded,
    togglePerf,
    setQuality,
    toggleEffect,
    setMetrics,
    recordBaseline,
    toggleFloor,
    cameras,
    selectedCameraId,
    selectedCamera,
    selectCamera,
    closeCamera,
    tourSteps,
    tour,
    startTour,
    stopTour,
    nextTourStep,
    prevTourStep,
    jumpTourStep,
  }
})
