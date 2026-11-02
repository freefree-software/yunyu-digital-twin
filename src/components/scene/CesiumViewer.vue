<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch, computed } from 'vue'
import * as Cesium from 'cesium'
import 'cesium/Build/Cesium/Widgets/widgets.css'
import { VIEW_LEVELS, useDashboardStore } from '@/stores/dashboard'
import SceneMinimap from '@/components/scene/SceneMinimap.vue'
import InfoCard from '@/components/scene/InfoCard.vue'
import DisposalTimeline from '@/components/scene/DisposalTimeline.vue'
import PerformancePanel from '@/components/scene/PerformancePanel.vue'
import VideoModal from '@/components/scene/VideoModal.vue'
import { toSeconds } from '@/utils/time'
import { useScreenScale } from '@/composables/useScreenScale'
import type { Building, BuildingKind } from '@/types/domain'

const store = useDashboardStore()
const { scale: screenScale } = useScreenScale()

const container = ref<HTMLDivElement | null>(null)
const minimap = ref<InstanceType<typeof SceneMinimap> | null>(null)
const loading = ref(true)

let viewer: Cesium.Viewer | undefined
let loadingTimer: number | undefined
let removeTileListener: (() => void) | undefined
let detachCanvasEvents: (() => void) | undefined
let cameraListener: (() => void) | undefined

const layerSources: Record<string, Cesium.CustomDataSource> = {}

const PRIMARY = Cesium.Color.fromCssColorString('#00e5ff')
const ALERT = Cesium.Color.fromCssColorString('#ff6b35')
const WARNING = Cesium.Color.fromCssColorString('#ffb547')
const SUCCESS = Cesium.Color.fromCssColorString('#18e5a0')
const TEXT = Cesium.Color.fromCssColorString('#d7e7f7')
const DEEP = Cesium.Color.fromCssColorString('#050b14')

const BUILDING_COLORS: Record<BuildingKind, Cesium.Color> = {
  office: Cesium.Color.fromCssColorString('#16324a'),
  lab: Cesium.Color.fromCssColorString('#163a44'),
  factory: Cesium.Color.fromCssColorString('#1d3245'),
  warehouse: Cesium.Color.fromCssColorString('#22303f'),
  commercial: Cesium.Color.fromCssColorString('#1b3550'),
  residential: Cesium.Color.fromCssColorString('#1a2f46'),
  utility: Cesium.Color.fromCssColorString('#232f42'),
  public: Cesium.Color.fromCssColorString('#18384a'),
}

const RESOURCE_COLORS = {
  fire: ALERT,
  medical: SUCCESS,
  team: PRIMARY,
}

const DEVICE_COLORS = {
  normal: SUCCESS,
  warning: WARNING,
  offline: ALERT,
}

const ROAD_STYLES = {
  main: { width: 5, alpha: 0.34 },
  secondary: { width: 3.5, alpha: 0.26 },
  service: { width: 2, alpha: 0.16 },
  walk: { width: 2, alpha: 0.2 },
}

const buildingHeights = new Map<string, number>()
const buildingRings = new Map<string, Array<[number, number]>>()
const deviceIds = new Set<string>()
const alertIds = new Set<string>()

const PARK_CENTER = { lon: 120.42025, lat: 36.0595 }

const VIEW_PRESETS = {
  district: { radius: 1900, distance: 4300, pitch: -55 },
  campus: { radius: 780, distance: 1700, pitch: -38 },
}

const sceneTitle = computed(() => {
  if (store.viewLevel === 'building' && store.selectedBuilding) {
    return `${store.selectedBuilding.name} · 楼栋近景`
  }
  return store.viewLevel === 'district' ? '片区全景' : '园区总览'
})

function flyToLevel(level: 'district' | 'campus') {
  if (!viewer) return
  const preset = VIEW_PRESETS[level]
  const target = new Cesium.BoundingSphere(
    Cesium.Cartesian3.fromDegrees(PARK_CENTER.lon, PARK_CENTER.lat, 0),
    preset.radius,
  )
  viewer.camera.flyToBoundingSphere(target, {
    duration: 1.8,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    offset: new Cesium.HeadingPitchRange(0, Cesium.Math.toRadians(preset.pitch), preset.distance),
  })
}

function flyToBuilding(building: Building) {
  if (!viewer) return
  const height = Math.max(building.height, 24)
  const target = new Cesium.BoundingSphere(
    Cesium.Cartesian3.fromDegrees(building.center[0], building.center[1], building.height / 2),
    height * 0.8,
  )
  viewer.camera.flyToBoundingSphere(target, {
    duration: 1.6,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
    offset: new Cesium.HeadingPitchRange(
      viewer.camera.heading,
      Cesium.Math.toRadians(-42),
      Math.max(300, height * 6),
    ),
  })
}

/** 小地图点击：把点击点移到画面中心，高度与朝向沿用当前相机 */
function flyToPoint(lon: number, lat: number) {
  if (!viewer) return
  const camera = viewer.camera
  const height = camera.positionCartographic.height
  const pitch = Math.min(camera.pitch, Cesium.Math.toRadians(-18))
  const heading = camera.heading
  const distance = height / Math.tan(-pitch)
  const latDest = lat - (distance * Math.cos(heading)) / 111000
  const lonDest = lon - (distance * Math.sin(heading)) / (111000 * Math.cos(Cesium.Math.toRadians(lat)))

  camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lonDest, latDest, height),
    orientation: { heading, pitch, roll: 0 },
    duration: 1.2,
    easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
  })
}

function updateMinimap() {
  if (!viewer || !minimap.value) return
  const camera = viewer.camera
  const carto = camera.positionCartographic
  const lat = Cesium.Math.toDegrees(carto.latitude)
  const lon = Cesium.Math.toDegrees(carto.longitude)
  const rect = camera.computeViewRectangle(viewer.scene.globe.ellipsoid)

  if (!rect) {
    minimap.value.updateViewport(null)
    return
  }

  // 低俯仰时可视范围会一直延伸到地平线，截断到相机周边 2.2km，避免矩形铺满小地图
  const dLat = 2200 / 111000
  const dLon = 2200 / (111000 * Math.cos(Cesium.Math.toRadians(lat)))
  const limited = Cesium.Rectangle.intersection(
    rect,
    Cesium.Rectangle.fromDegrees(lon - dLon, lat - dLat, lon + dLon, lat + dLat),
  )

  if (!limited) {
    minimap.value.updateViewport(null)
    return
  }

  minimap.value.updateViewport(
    {
      west: Cesium.Math.toDegrees(limited.west),
      south: Cesium.Math.toDegrees(limited.south),
      east: Cesium.Math.toDegrees(limited.east),
      north: Cesium.Math.toDegrees(limited.north),
    },
    { lon, lat, heading: camera.heading },
  )
}

function createSource(name: string) {
  const source = new Cesium.CustomDataSource(name)
  viewer?.dataSources.add(source)
  layerSources[name] = source
  return source
}

function buildBoundary() {
  const sceneData = store.scene
  if (!sceneData) return
  const source = createSource('boundary')

  for (const feature of sceneData.boundary.features) {
    const ring = feature.geometry.coordinates[0].map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat))
    source.entities.add({
      name: feature.properties.name,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(ring),
        height: 0,
        material: PRIMARY.withAlpha(0.05),
      },
    })
    source.entities.add({
      polyline: {
        positions: ring,
        width: 10,
        material: PRIMARY.withAlpha(0.12),
        clampToGround: true,
      },
    })
    source.entities.add({
      polyline: {
        positions: ring,
        width: 2,
        material: PRIMARY.withAlpha(0.85),
        clampToGround: true,
      },
    })
  }
}

function buildWater() {
  const sceneData = store.scene
  if (!sceneData) return
  const source = createSource('water')

  for (const feature of sceneData.water.features) {
    const ring = feature.geometry.coordinates[0].map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat))
    source.entities.add({
      name: feature.properties.name,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(ring),
        height: 0.2,
        material: Cesium.Color.fromCssColorString('#0c3550').withAlpha(0.92),
      },
    })
    source.entities.add({
      polyline: {
        positions: ring,
        width: 1.5,
        material: PRIMARY.withAlpha(0.4),
        clampToGround: true,
      },
    })
  }
}

function buildRoads() {
  const sceneData = store.scene
  if (!sceneData) return
  const source = createSource('roads')

  for (const feature of sceneData.roads.features) {
    const style = ROAD_STYLES[feature.properties.kind]
    source.entities.add({
      name: feature.properties.name,
      polyline: {
        positions: feature.geometry.coordinates.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat)),
        width: style.width,
        material: PRIMARY.withAlpha(style.alpha),
        clampToGround: true,
      },
    })
  }
}

function buildBuildings() {
  const sceneData = store.scene
  if (!sceneData) return
  const source = createSource('buildings')

  for (const feature of sceneData.buildings.features) {
    const building = feature.properties
    const coords = feature.geometry.coordinates[0]
    const groundRing = coords.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat))
    const roofRing = coords.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, building.height + 0.4))
    buildingHeights.set(building.id, building.height)
    buildingRings.set(
      building.id,
      coords.map(([lon, lat]) => [lon, lat] as [number, number]),
    )

    source.entities.add({
      id: building.id,
      name: building.name,
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(groundRing),
        height: 0,
        extrudedHeight: building.height,
        material: (building.keyBuilding
          ? Cesium.Color.fromCssColorString('#1d4b63')
          : BUILDING_COLORS[building.kind]
        ).withAlpha(0.9),
        outline: false,
        shadows: Cesium.ShadowMode.DISABLED,
      },
    })

    if (building.keyBuilding) {
      source.entities.add({
        polyline: {
          positions: roofRing,
          width: 1.5,
          material: PRIMARY.withAlpha(0.55),
        },
      })
      source.entities.add({
        position: Cesium.Cartesian3.fromDegrees(building.center[0], building.center[1], building.height + 12),
        label: {
          text: building.name,
          font: '500 12px "PingFang SC", sans-serif',
          fillColor: TEXT,
          showBackground: true,
          backgroundColor: DEEP.withAlpha(0.7),
          backgroundPadding: new Cesium.Cartesian2(6, 4),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 1800),
        },
      })
    }
  }
}

const SURROUND_FILL = Cesium.Color.fromCssColorString('#102434')
const SELECT_FILL = PRIMARY.withAlpha(0.24)

let surroundPrimitive: Cesium.Primitive | undefined

/** 周边楼宇合成一个 Primitive，避免上百次独立绘制 */
function buildSurroundings() {
  const sceneData = store.scene
  if (!sceneData || !viewer) return

  const instances = sceneData.surroundings.features.map((feature) => {
    const positions = feature.geometry.coordinates[0].map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat))
    return new Cesium.GeometryInstance({
      geometry: new Cesium.PolygonGeometry({
        polygonHierarchy: new Cesium.PolygonHierarchy(positions),
        height: 0,
        extrudedHeight: feature.properties.height,
        vertexFormat: Cesium.PerInstanceColorAppearance.VERTEX_FORMAT,
      }),
      attributes: {
        color: new Cesium.ColorGeometryInstanceAttribute(
          SURROUND_FILL.red,
          SURROUND_FILL.green,
          SURROUND_FILL.blue,
          1,
        ),
      },
    })
  })

  surroundPrimitive = viewer.scene.primitives.add(
    new Cesium.Primitive({
      geometryInstances: instances,
      appearance: new Cesium.PerInstanceColorAppearance({ flat: true, translucent: false }),
      asynchronous: false,
    }),
  )
  surroundPrimitive.show = store.layers.surroundings
}

let selectionSource: Cesium.CustomDataSource | undefined
let alertFocusSource: Cesium.CustomDataSource | undefined
let routeSource: Cesium.CustomDataSource | undefined
let trackSource: Cesium.CustomDataSource | undefined
let trendSource: Cesium.CustomDataSource | undefined

function updateSelection() {
  if (!selectionSource) return
  selectionSource.entities.removeAll()

  const device = store.selectedDevice
  if (device) {
    const height = (buildingHeights.get(device.buildingId) ?? 0) + 2
    const fill = DEVICE_COLORS[device.status]
    selectionSource.entities.add({
      position: Cesium.Cartesian3.fromDegrees(device.lon, device.lat, height),
      ellipse: {
        semiMajorAxis: 7,
        semiMinorAxis: 7,
        material: fill.withAlpha(0.45),
        outline: true,
        outlineColor: fill,
        outlineWidth: 2,
      },
    })
  }

  if (store.floorExpanded) return

  const id = store.selectedBuildingId
  const ring = id ? buildingRings.get(id) : undefined
  if (!id || !ring) return

  const height = buildingHeights.get(id) ?? 0
  const ground = ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat))
  const roof = ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, height + 1))

  selectionSource.entities.add({
    polygon: {
      hierarchy: new Cesium.PolygonHierarchy(ground),
      height: 0,
      extrudedHeight: height + 1.2,
      material: SELECT_FILL,
      outline: false,
      shadows: Cesium.ShadowMode.DISABLED,
    },
  })
  selectionSource.entities.add({
    polyline: { positions: roof, width: 2.5, material: PRIMARY },
  })
}

/** 告警定位：楼体变红 + 告警点扩散脉冲 */
function updateAlertFocus() {
  if (!alertFocusSource) return
  alertFocusSource.entities.removeAll()

  const alert = store.selectedAlert
  if (!alert) return

  const ring = buildingRings.get(alert.buildingId)
  const height = buildingHeights.get(alert.buildingId) ?? 0
  if (ring) {
    const ground = ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat))
    const roof = ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, height + 1.4))
    alertFocusSource.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(ground),
        height: 0,
        extrudedHeight: height + 1.4,
        material: ALERT.withAlpha(store.disposalStage >= 5 ? 0.12 : 0.36),
        outline: false,
        shadows: Cesium.ShadowMode.DISABLED,
      },
    })
    alertFocusSource.entities.add({
      polyline: { positions: roof, width: 3, material: ALERT },
    })
  }

  const radius = new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
    const now = time ? Cesium.JulianDate.toDate(time).getTime() : Date.now()
    const phase = (now % 1600) / 1600
    return 16 + phase * 62
  }, false)

  alertFocusSource.entities.add({
    position: Cesium.Cartesian3.fromDegrees(alert.lon, alert.lat, height + 2),
    ellipse: {
      semiMajorAxis: radius,
      semiMinorAxis: radius,
      material: ALERT.withAlpha(store.disposalStage >= 5 ? 0.08 : 0.22),
    },
  })
  alertFocusSource.entities.add({
    position: Cesium.Cartesian3.fromDegrees(alert.lon, alert.lat, height + 6),
    point: { pixelSize: 14, color: ALERT, outlineColor: DEEP, outlineWidth: 2 },
    label: {
      text: `${alert.type} · ${alert.buildingName}`,
      font: '600 12px "PingFang SC", sans-serif',
      fillColor: ALERT,
      showBackground: true,
      backgroundColor: DEEP.withAlpha(0.78),
      backgroundPadding: new Cesium.Cartesian2(7, 4),
      pixelOffset: new Cesium.Cartesian2(0, -22),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4000),
    },
  })
}

/** 图表联动：当前小时筛选出的告警在场景中高亮 */
function updateTrendHighlight() {
  if (!trendSource) return
  trendSource.entities.removeAll()
  if (store.trendHour === null) return

  for (const alert of store.filteredAlerts) {
    const height = buildingHeights.get(alert.buildingId) ?? 0
    trendSource.entities.add({
      position: Cesium.Cartesian3.fromDegrees(alert.lon, alert.lat, height + 4),
      point: { pixelSize: 12, color: PRIMARY, outlineColor: DEEP, outlineWidth: 2 },
      ellipse: {
        semiMajorAxis: 26,
        semiMinorAxis: 26,
        material: PRIMARY.withAlpha(0.2),
      },
    })
  }
}

// ---------------------------------------------------------------- 路径规划与行进动画

let routePositions: Cesium.Cartesian3[] = []
let routeCumulative: number[] = []
let routeTotal = 0
let routeMarker: Cesium.Entity | undefined
let routeProgressLine: Cesium.Entity | undefined
let routeRaf = 0

function stopRouteAnimation() {
  if (routeRaf) cancelAnimationFrame(routeRaf)
  routeRaf = 0
}

function startRouteAnimation() {
  if (!routeSource) return
  stopRouteAnimation()
  routeSource.entities.removeAll()

  const route = store.route
  if (!route) {
    routePositions = []
    routeCumulative = []
    routeMarker = undefined
    routeProgressLine = undefined
    return
  }

  routePositions = route.positions.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat, 2))
  routeCumulative = [0]
  routeTotal = 0
  for (let index = 1; index < routePositions.length; index += 1) {
    routeTotal += Cesium.Cartesian3.distance(routePositions[index - 1], routePositions[index])
    routeCumulative.push(routeTotal)
  }
  if (routePositions.length < 2) return

  routeSource.entities.add({
    polyline: {
      positions: routePositions,
      width: 8,
      material: PRIMARY.withAlpha(0.16),
      clampToGround: true,
    },
  })

  routeProgressLine = routeSource.entities.add({
    polyline: {
      positions: [routePositions[0], routePositions[1]],
      width: 3,
      material: PRIMARY,
      clampToGround: true,
    },
  })

  const startPosition = routePositions[0]
  routeMarker = routeSource.entities.add({
    position: startPosition,
    point: {
      pixelSize: 13,
      color: ALERT,
      outlineColor: DEEP,
      outlineWidth: 2,
    },
    label: {
      text: route.resourceName,
      font: '500 11px "PingFang SC", sans-serif',
      fillColor: ALERT,
      showBackground: true,
      backgroundColor: DEEP.withAlpha(0.72),
      backgroundPadding: new Cesium.Cartesian2(5, 3),
      pixelOffset: new Cesium.Cartesian2(0, -18),
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
    },
  })

  const started = performance.now()
  const duration = route.duration

  const step = (now: number) => {
    if (!store.route || !routeMarker || !routeProgressLine) return
    const ratio = Math.min(1, (now - started) / duration)
    const traveled = routeTotal * ratio

    let index = 1
    while (index < routeCumulative.length - 1 && routeCumulative[index] < traveled) index += 1
    const prevDistance = routeCumulative[index - 1]
    const span = Math.max(1, routeCumulative[index] - prevDistance)
    const local = Math.min(1, Math.max(0, (traveled - prevDistance) / span))
    const position = Cesium.Cartesian3.lerp(
      routePositions[index - 1],
      routePositions[index],
      local,
      new Cesium.Cartesian3(),
    )

    routeMarker.position = new Cesium.ConstantPositionProperty(position)
    const visible = routePositions.slice(0, index + 1)
    if (visible.length >= 2) routeProgressLine.polyline!.positions = new Cesium.ConstantProperty(visible)

    if (ratio < 1) {
      routeRaf = requestAnimationFrame(step)
    } else {
      routeRaf = 0
      store.completeRoute()
    }
  }

  routeRaf = requestAnimationFrame(step)
}

// ---------------------------------------------------------------- 轨迹回放

const trackCartesians = new Map<string, Cesium.Cartesian3[]>()
const trackCursors = new Map<string, number>()
let trackEntities = new Map<string, { marker: Cesium.Entity }>()

function buildTracks() {
  if (!trackSource) return

  for (const meta of store.tracks) {
    const points = store.trackPoints.get(meta.id)
    if (!points?.length) continue
    const cartesians = points.map((point) =>
      Cesium.Cartesian3.fromDegrees(point.lon, point.lat, 3),
    )
    trackCartesians.set(meta.id, cartesians)
    trackCursors.set(meta.id, 0)

    const color = meta.kind === 'vehicle' ? PRIMARY : SUCCESS

    trackSource.entities.add({
      polyline: {
        positions: cartesians,
        width: meta.kind === 'vehicle' ? 2 : 1.4,
        material: color.withAlpha(0.26),
        clampToGround: true,
      },
    })

    const marker = trackSource.entities.add({
      position: new Cesium.CallbackPositionProperty(
        () => trackCartesians.get(meta.id)?.[trackCursors.get(meta.id) ?? 0] ?? cartesians[0],
        false,
      ),
      point: {
        pixelSize: 8,
        color,
        outlineColor: DEEP,
        outlineWidth: 2,
      },
      label: {
        text: meta.name,
        font: '500 10px "PingFang SC", sans-serif',
        fillColor: color,
        showBackground: true,
        backgroundColor: DEEP.withAlpha(0.6),
        backgroundPadding: new Cesium.Cartesian2(4, 2),
        pixelOffset: new Cesium.Cartesian2(0, -14),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2600),
      },
      show: false,
    })

    trackEntities.set(meta.id, { marker })
  }
}

function updateTracks() {
  if (!trackSource) return
  trackSource.show = store.trackVisible
  if (!store.trackVisible) return

  const { start, end } = store.playbackWindow
  const now = start + (end - start) * store.trackProgress

  for (const meta of store.tracks) {
    const entity = trackEntities.get(meta.id)
    const points = store.trackPoints.get(meta.id)
    if (!entity || !points?.length) continue

    const isActive = !store.selectedTrackId || store.selectedTrackId === meta.id
    const started = toSeconds(points[0].time) <= now

    let low = 0
    let high = points.length - 1
    let index = 0
    while (low <= high) {
      const mid = (low + high) >> 1
      if (toSeconds(points[mid].time) <= now) {
        index = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    trackCursors.set(meta.id, index)
    entity.marker.show = isActive && started
  }
}


function handlePick(position: Cesium.Cartesian2) {
  if (!viewer) return
  const picked = viewer.scene.pick(position)
  const pickedId = picked?.id?.id
  if (typeof pickedId !== 'string') return
  if (pickedId.startsWith('CAM-')) {
    store.selectCamera(pickedId)
  } else if (buildingRings.has(pickedId)) {
    store.selectBuilding(pickedId)
  } else if (deviceIds.has(pickedId)) {
    store.selectDevice(pickedId)
  } else if (alertIds.has(pickedId)) {
    store.focusAlert(pickedId)
  }
}

/**
 * 场景容器被 CSS transform 缩放，Cesium 自带的 ScreenSpaceEventHandler 取到的坐标会偏移，
 * 这里用原生指针事件按 canvas 实际尺寸换算后再拾取。
 */
function bindPicking(scene: Cesium.Scene) {
  const canvas = scene.canvas
  let downX = 0
  let downY = 0
  let dragDistance = 0
  let pressing = false

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    pressing = true
    downX = event.clientX
    downY = event.clientY
    dragDistance = 0
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!pressing) return
    dragDistance = Math.max(dragDistance, Math.hypot(event.clientX - downX, event.clientY - downY))
  }

  const onPointerUp = () => {
    pressing = false
  }

  const onClick = (event: MouseEvent) => {
    const moved = dragDistance
    dragDistance = 0
    if (moved > 4) return

    const rect = canvas.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width) * canvas.clientWidth
    const y = ((event.clientY - rect.top) / rect.height) * canvas.clientHeight
    handlePick(new Cesium.Cartesian2(x, y))
  }

  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('click', onClick)
  return () => {
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('click', onClick)
  }
}

function buildPoi() {
  const sceneData = store.scene
  if (!sceneData) return
  const source = createSource('poi')

  for (const feature of sceneData.poi.features) {
    const [lon, lat] = feature.geometry.coordinates
    source.entities.add({
      name: feature.properties.name,
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      point: {
        pixelSize: 5,
        color: PRIMARY.withAlpha(0.9),
        outlineColor: DEEP.withAlpha(0.9),
        outlineWidth: 2,
      },
      label: {
        text: feature.properties.name,
        font: '400 11px "PingFang SC", sans-serif',
        fillColor: TEXT.withAlpha(0.85),
        showBackground: true,
        backgroundColor: DEEP.withAlpha(0.52),
        backgroundPadding: new Cesium.Cartesian2(5, 3),
        pixelOffset: new Cesium.Cartesian2(0, -14),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2600),
      },
    })
  }

  for (const camera of store.cameras) {
    source.entities.add({
      id: camera.id,
      name: camera.name,
      position: Cesium.Cartesian3.fromDegrees(camera.lon, camera.lat, camera.height),
      point: {
        pixelSize: 8,
        color: camera.online ? WARNING : ALERT,
        outlineColor: DEEP,
        outlineWidth: 1.5,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 3200),
      },
      label: {
        text: 'CAM',
        font: '600 9px "PingFang SC", sans-serif',
        fillColor: camera.online ? WARNING : ALERT,
        showBackground: true,
        backgroundColor: DEEP.withAlpha(0.6),
        backgroundPadding: new Cesium.Cartesian2(3, 2),
        pixelOffset: new Cesium.Cartesian2(0, -13),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 2000),
      },
    })
  }
}

function buildResources() {
  const sceneData = store.scene
  if (!sceneData) return
  const source = createSource('resources')

  for (const feature of sceneData.resources.features) {
    const [lon, lat] = feature.geometry.coordinates
    const color = RESOURCE_COLORS[feature.properties.type]
    source.entities.add({
      name: feature.properties.name,
      position: Cesium.Cartesian3.fromDegrees(lon, lat, 4),
      point: {
        pixelSize: 10,
        color,
        outlineColor: DEEP,
        outlineWidth: 2,
      },
      label: {
        text: `${feature.properties.name} · ${feature.properties.distanceKm.toFixed(1)} km`,
        font: '500 12px "PingFang SC", sans-serif',
        fillColor: color,
        showBackground: true,
        backgroundColor: DEEP.withAlpha(0.66),
        backgroundPadding: new Cesium.Cartesian2(6, 4),
        pixelOffset: new Cesium.Cartesian2(0, -18),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 7000),
      },
    })
  }
}

function buildDevices() {
  const source = layerSources.devices
  if (!source) return
  source.entities.removeAll()
  deviceIds.clear()

  for (const device of store.devices) {
    const height = (buildingHeights.get(device.buildingId) ?? 0) + 2
    deviceIds.add(device.id)
    source.entities.add({
      id: device.id,
      name: `${device.name}（${device.status}）`,
      position: Cesium.Cartesian3.fromDegrees(device.lon, device.lat, height),
      point: {
        pixelSize: 8,
        color: DEVICE_COLORS[device.status],
        outlineColor: DEEP.withAlpha(0.85),
        outlineWidth: 1.5,
      },
    })
  }
}

function buildAlerts() {
  const source = layerSources.alerts
  if (!source) return
  source.entities.removeAll()
  alertIds.clear()

  for (const alert of store.alerts) {
    if (alert.status === 'resolved') continue
    alertIds.add(alert.id)
    const baseHeight = buildingHeights.get(alert.buildingId) ?? 0
    const color = alert.status === 'pending' ? ALERT : WARNING

    source.entities.add({
      id: alert.id,
      name: alert.type,
      position: Cesium.Cartesian3.fromDegrees(alert.lon, alert.lat, baseHeight + 5),
      point: {
        pixelSize: alert.status === 'pending' ? 11 : 8,
        color,
        outlineColor: DEEP,
        outlineWidth: 2,
      },
      label: {
        text: alert.type,
        font: '500 11px "PingFang SC", sans-serif',
        fillColor: color,
        showBackground: true,
        backgroundColor: DEEP.withAlpha(0.66),
        backgroundPadding: new Cesium.Cartesian2(5, 3),
        pixelOffset: new Cesium.Cartesian2(0, -18),
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 4200),
      },
    })

    if (alert.status === 'pending') {
      const pulseRadius = new Cesium.CallbackProperty((time?: Cesium.JulianDate) => {
        const now = time ? Cesium.JulianDate.toDate(time).getTime() : Date.now()
        const phase = (now % 1500) / 1500
        return 14 + phase * 46
      }, false)
      source.entities.add({
        position: Cesium.Cartesian3.fromDegrees(alert.lon, alert.lat),
        ellipse: {
          height: 0.6,
          semiMajorAxis: pulseRadius,
          semiMinorAxis: pulseRadius,
          material: ALERT.withAlpha(0.18),
        },
      })
    }
  }
}

// ---------------------------------------------------------------- Step 4：自定义材质、楼层抽离、性能监控

const flowPrimitives: Cesium.Primitive[] = []
let scanPrimitive: Cesium.Primitive | undefined
let heatSource: Cesium.CustomDataSource | undefined
let floorSource: Cesium.CustomDataSource | undefined
let selectedFloorBuildingId: string | null = null
let floorRaf = 0
let metricsTimer: number | undefined
let removePostRender: (() => void) | undefined
let frameCount = 0
let lastDrawCalls = 0
let lastTriangles = 0

function registerEffectMaterials() {
  const cache = (Cesium.Material as unknown as { _materialCache?: { addMaterial: (type: string, def: unknown) => void } })
    ._materialCache
  if (!cache) return

  cache.addMaterial('YunyuBoundaryFlow', {
    fabric: {
      type: 'YunyuBoundaryFlow',
      uniforms: { color: new Cesium.Color(0, 0.898, 1, 1) },
    },
    translucent: true,
    source: `
      czm_material czm_getMaterial(czm_materialInput materialInput)
      {
        czm_material material = czm_getDefaultMaterial(materialInput);
        float head = fract(czm_frameNumber * 0.0022);
        float d = abs(fract(materialInput.st.s - head + 0.5) - 0.5);
        float glow = smoothstep(0.3, 0.0, d);
        material.diffuse = mix(color.rgb, vec3(1.0), glow * 0.4);
        material.alpha = 0.18 + glow * 0.8;
        return material;
      }
    `,
  })

  cache.addMaterial('YunyuScanRing', {
    fabric: {
      type: 'YunyuScanRing',
      uniforms: { color: new Cesium.Color(0, 0.898, 1, 1) },
    },
    translucent: true,
    source: `
      czm_material czm_getMaterial(czm_materialInput materialInput)
      {
        czm_material material = czm_getDefaultMaterial(materialInput);
        float d = length(materialInput.st - vec2(0.5)) * 2.0;
        float phase = fract(czm_frameNumber * 0.0016);
        float band = smoothstep(0.05, 0.0, abs(d - phase));
        material.diffuse = color.rgb;
        material.alpha = band * 0.5;
        return material;
      }
    `,
  })
}

function buildEffectPrimitives() {
  if (!viewer || !store.scene) return

  for (const feature of store.scene.boundary.features) {
    const positions = feature.geometry.coordinates[0].map(([lon, lat]) =>
      Cesium.Cartesian3.fromDegrees(lon, lat, 1.6),
    )
    const primitive = new Cesium.Primitive({
      geometryInstances: new Cesium.GeometryInstance({
        geometry: new Cesium.PolylineGeometry({
          positions,
          width: 3,
          vertexFormat: Cesium.PolylineMaterialAppearance.VERTEX_FORMAT,
        }),
      }),
      appearance: new Cesium.PolylineMaterialAppearance({
        material: new Cesium.Material({ fabric: { type: 'YunyuBoundaryFlow' } }),
        translucent: true,
      }),
      asynchronous: false,
      show: store.effects.boundaryFlow,
    })
    viewer.scene.primitives.add(primitive)
    flowPrimitives.push(primitive)
  }

  scanPrimitive = new Cesium.Primitive({
    geometryInstances: new Cesium.GeometryInstance({
      geometry: new Cesium.CircleGeometry({
        center: Cesium.Cartesian3.fromDegrees(PARK_CENTER.lon, PARK_CENTER.lat, 2),
        radius: 720,
      }),
    }),
    appearance: new Cesium.MaterialAppearance({
      material: new Cesium.Material({ fabric: { type: 'YunyuScanRing' } }),
      translucent: true,
      flat: true,
    }),
    asynchronous: false,
    show: store.effects.scan,
  })
  viewer.scene.primitives.add(scanPrimitive)
}

/** 告警热力：按未处置告警所在楼宇叠加暖色光斑 */
function buildHeatmap() {
  if (!heatSource) return
  heatSource.entities.removeAll()

  for (const alert of store.unresolvedAlerts) {
    const height = buildingHeights.get(alert.buildingId) ?? 0
    heatSource.entities.add({
      position: Cesium.Cartesian3.fromDegrees(alert.lon, alert.lat, height * 0.6 + 1),
      ellipse: {
        semiMajorAxis: 90,
        semiMinorAxis: 70,
        material: ALERT.withAlpha(0.1),
      },
    })
    heatSource.entities.add({
      position: Cesium.Cartesian3.fromDegrees(alert.lon, alert.lat, height * 0.6 + 1.2),
      ellipse: {
        semiMajorAxis: 38,
        semiMinorAxis: 30,
        material: ALERT.withAlpha(0.16),
      },
    })
  }
  heatSource.show = store.effects.heatmap
}

function applyEffects() {
  flowPrimitives.forEach((primitive) => {
    primitive.show = store.effects.boundaryFlow
  })
  if (scanPrimitive) scanPrimitive.show = store.effects.scan
  if (heatSource) heatSource.show = store.effects.heatmap
}

/** 楼层抽离：选中楼栋按层拆分为独立体块并纵向拉开 */
function buildFloors() {
  if (!floorSource) return
  cancelAnimationFrame(floorRaf)
  floorSource.entities.removeAll()

  if (selectedFloorBuildingId) {
    const previous = layerSources.buildings?.entities.getById(selectedFloorBuildingId)
    if (previous) previous.show = true
    selectedFloorBuildingId = null
  }

  const building = store.selectedBuilding
  if (!building || !store.floorExpanded) return

  const entity = layerSources.buildings?.entities.getById(building.id)
  if (entity) entity.show = false
  selectedFloorBuildingId = building.id

  const ring = buildingRings.get(building.id)
  if (!ring) return

  const floors = Math.min(building.floors, 12)
  const floorHeight = building.height / floors
  const gap = { value: 0 }

  for (let index = 0; index < floors; index += 1) {
    floorSource.entities.add({
      polygon: {
        hierarchy: new Cesium.PolygonHierarchy(
          ring.map(([lon, lat]) => Cesium.Cartesian3.fromDegrees(lon, lat)),
        ),
        height: new Cesium.CallbackProperty(() => index * (floorHeight + gap.value), false),
        extrudedHeight: new Cesium.CallbackProperty(
          () => (index + 1) * floorHeight + index * gap.value,
          false,
        ),
        material: (index % 2 === 0
          ? Cesium.Color.fromCssColorString('#1d4b63')
          : Cesium.Color.fromCssColorString('#12384d')
        ).withAlpha(0.94),
        outline: false,
        shadows: Cesium.ShadowMode.DISABLED,
      },
    })
    floorSource.entities.add({
      position: new Cesium.CallbackPositionProperty(
        () =>
          Cesium.Cartesian3.fromDegrees(
            building.center[0],
            building.center[1],
            (index + 1) * floorHeight + index * gap.value + 0.8,
          ),
        false,
      ),
      label: {
        text: `${index + 1}F`,
        font: '500 10px "PingFang SC", sans-serif',
        fillColor: PRIMARY,
        showBackground: true,
        backgroundColor: DEEP.withAlpha(0.7),
        backgroundPadding: new Cesium.Cartesian2(4, 2),
        pixelOffset: new Cesium.Cartesian2(24, 0),
        distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 700),
      },
    })
  }

  const started = performance.now()
  const step = (now: number) => {
    const ratio = Math.min(1, (now - started) / 700)
    gap.value = ratio * 4.5
    if (ratio < 1) floorRaf = requestAnimationFrame(step)
  }
  floorRaf = requestAnimationFrame(step)
}

/** 画质档位：分辨率缩放 + MSAA + 后处理，按需组合 */
function applyQuality(level: 'high' | 'balanced' | 'power') {
  if (!viewer) return
  const scene = viewer.scene
  // 大屏按 CSS 缩放比提高渲染分辨率，避免 2K/4K 下画面被放大后发糊
  const screenFactor = Math.min(2, Math.max(1, screenScale.value))
  const baseScale = level === 'high' ? 1 : level === 'balanced' ? 0.9 : 0.75

  if (level === 'high') {
    scene.msaaSamples = 4
    scene.postProcessStages.fxaa.enabled = true
  } else if (level === 'balanced') {
    scene.msaaSamples = 2
    scene.postProcessStages.fxaa.enabled = false
  } else {
    scene.msaaSamples = 1
    scene.postProcessStages.fxaa.enabled = false
    // 省电档同时关闭周边楼宇，作为可对比的合批/剔除优化项
    store.layers.surroundings = false
  }
  viewer.resolutionScale = Math.min(2, baseScale * screenFactor)
}

watch(
  () => screenScale.value,
  () => applyQuality(store.quality),
)

function startMetrics() {
  if (!viewer) return
  const scene = viewer.scene
  stopMetrics()

  removePostRender = scene.postRender.addEventListener(() => {
    frameCount += 1
    if (!store.perfVisible) return
    const commands =
      (scene as unknown as { frameState?: { commandList: Cesium.Command[] } }).frameState
        ?.commandList ?? []
    let triangles = 0
    for (const command of commands) {
      const draw = command as unknown as {
        count?: number
        instanceCount?: number
        primitiveType?: number
      }
      const count = draw.count ?? 0
      const instances = draw.instanceCount ?? 1
      if (draw.primitiveType === Cesium.PrimitiveType.TRIANGLES) {
        triangles += (count * instances) / 3
      } else if (draw.primitiveType === Cesium.PrimitiveType.LINES) {
        triangles += (count * instances) / 2
      }
    }
    lastDrawCalls = commands.length
    lastTriangles = Math.round(triangles)
  })

  metricsTimer = window.setInterval(() => {
    const memory = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory
    store.setMetrics({
      fps: frameCount * 2,
      drawCalls: lastDrawCalls,
      triangles: lastTriangles,
      heapMB: memory ? Math.round((memory.usedJSHeapSize / 1048576) * 10) / 10 : 0,
    })
    frameCount = 0
  }, 500)
}

function stopMetrics() {
  if (metricsTimer) window.clearInterval(metricsTimer)
  metricsTimer = undefined
  if (removePostRender) removePostRender()
  removePostRender = undefined
}

function applyLayers() {
  if (!viewer) return
  const imageryLayer = viewer.imageryLayers.get(0)
  if (imageryLayer) imageryLayer.show = store.layers.imagery

  if (layerSources.buildings) layerSources.buildings.show = store.layers.buildings
  if (surroundPrimitive) surroundPrimitive.show = store.layers.surroundings
  if (layerSources.devices) layerSources.devices.show = store.layers.devices
  if (layerSources.alerts) layerSources.alerts.show = store.layers.alerts
  if (layerSources.poi) layerSources.poi.show = store.layers.poi
}

function buildScene() {
  registerEffectMaterials()
  buildBoundary()
  buildWater()
  buildRoads()
  buildSurroundings()
  buildBuildings()
  selectionSource = createSource('selection')
  alertFocusSource = createSource('alertFocus')
  routeSource = createSource('route')
  trendSource = createSource('trend')
  trackSource = createSource('tracks')
  floorSource = createSource('floors')
  heatSource = createSource('heat')
  createSource('devices')
  createSource('alerts')
  updateSelection()
  buildPoi()
  buildResources()
  buildDevices()
  buildAlerts()
  buildHeatmap()
  buildTracks()
  buildEffectPrimitives()
  applyLayers()
  applyEffects()
  updateTracks()
}

onMounted(() => {
  if (!container.value) return

  viewer = new Cesium.Viewer(container.value, {
    baseLayer: false,
    animation: false,
    timeline: false,
    baseLayerPicker: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    fullscreenButton: false,
    infoBox: false,
    selectionIndicator: false,
    shouldAnimate: true,
  })

  const imagery = new Cesium.GridImageryProvider({
    color: PRIMARY.withAlpha(0.14),
    glowColor: PRIMARY.withAlpha(0.04),
    backgroundColor: Cesium.Color.fromCssColorString('#071422'),
    cells: 4,
    glowWidth: 2,
  })
  viewer.imageryLayers.addImageryProvider(imagery)

  const scene = viewer.scene
  scene.backgroundColor = DEEP
  scene.globe.baseColor = Cesium.Color.fromCssColorString('#0a1a2a')
  scene.globe.showGroundAtmosphere = false
  if (scene.skyBox) scene.skyBox.show = false
  if (scene.sun) scene.sun.show = false
  if (scene.moon) scene.moon.show = false
  scene.fog.enabled = false
  if (scene.skyAtmosphere) scene.skyAtmosphere.show = false
  scene.postProcessStages.fxaa.enabled = true

  viewer.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(120.42025, 36.0475, 980),
    orientation: {
      heading: Cesium.Math.toRadians(0),
      pitch: Cesium.Math.toRadians(-36),
      roll: 0,
    },
  })

  buildScene()
  applyQuality(store.quality)
  startMetrics()
  viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK)
  detachCanvasEvents = bindPicking(scene)

  cameraListener = viewer.camera.moveEnd.addEventListener(() => updateMinimap())
  updateMinimap()

  removeTileListener = scene.globe.tileLoadProgressEvent.addEventListener((queued) => {
    if (queued === 0) {
      loading.value = false
      removeTileListener?.()
      removeTileListener = undefined
    }
  })

  loadingTimer = window.setTimeout(() => {
    loading.value = false
  }, 2500)
})

watch(
  () => store.layers,
  () => applyLayers(),
  { deep: true },
)

watch(
  () => [store.viewLevel, store.selectedBuildingId] as const,
  ([level, id], previous) => {
    updateSelection()
    if (level === 'building' && id) {
      const building = store.buildings.find((item) => item.id === id)
      if (building) flyToBuilding(building)
      return
    }
    if (previous && previous[0] !== level && (level === 'district' || level === 'campus')) {
      flyToLevel(level)
    }
  },
)

watch(
  () => store.selectedDeviceId,
  () => updateSelection(),
)

watch(
  () => store.selectedAlertId,
  () => updateAlertFocus(),
)

watch(
  () => store.disposalStage,
  () => updateAlertFocus(),
)

watch(
  () => store.route,
  () => startRouteAnimation(),
)

watch(
  () => [store.trackVisible, store.trackProgress, store.selectedTrackId] as const,
  () => updateTracks(),
)

watch(
  () => store.trendHour,
  () => updateTrendHighlight(),
)

watch(
  () => store.alerts.map((item) => `${item.id}:${item.status}`).join('|'),
  () => {
    buildAlerts()
    buildHeatmap()
    updateTrendHighlight()
    updateAlertFocus()
  },
)

watch(
  () => store.effects,
  () => applyEffects(),
  { deep: true },
)

watch(
  () => store.quality,
  (level) => applyQuality(level),
)

watch(
  () => [store.floorExpanded, store.selectedBuildingId] as const,
  () => {
    buildFloors()
    updateSelection()
  },
)

watch(
  () => store.deviceRevision,
  () => buildDevices(),
)

watch(
  () => [store.selectedAlertId, store.selectedBuildingId, store.selectedDeviceId] as const,
  () => syncMinimapFocus(),
)

function syncMinimapFocus() {
  const instance = minimap.value
  if (!instance) return
  const device = store.selectedDevice
  if (device) {
    instance.setFocus(device.lon, device.lat, 'device')
    return
  }
  const alert = store.selectedAlert
  if (alert) {
    instance.setFocus(alert.lon, alert.lat, 'alert')
    return
  }
  const building = store.selectedBuilding
  if (building) {
    instance.setFocus(building.center[0], building.center[1], 'building')
    return
  }
  instance.setFocus(null)
}

onBeforeUnmount(() => {
  if (loadingTimer) window.clearTimeout(loadingTimer)
  removeTileListener?.()
  removeTileListener = undefined
  cameraListener?.()
  cameraListener = undefined
  detachCanvasEvents?.()
  detachCanvasEvents = undefined
  stopRouteAnimation()
  cancelAnimationFrame(floorRaf)
  stopMetrics()
  viewer?.destroy()
  viewer = undefined
})
</script>

<template>
  <section class="scene-panel">
    <div ref="container" class="cesium-container"></div>

    <div class="scene-head">
      <span class="scene-title">三维场景 · {{ sceneTitle }}</span>
      <div class="level-switch">
        <button
          v-for="level in VIEW_LEVELS"
          :key="level.key"
          class="level-btn"
          :class="{ active: store.viewLevel === level.key }"
          :disabled="level.key === 'building' && !store.selectedBuildingId"
          @click="store.setViewLevel(level.key)"
        >
          {{ level.label }}
        </button>
      </div>
      <span class="scene-chip">Step 3 · 业务闭环</span>
    </div>

    <InfoCard />

    <SceneMinimap ref="minimap" @fly="flyToPoint" />
    <DisposalTimeline />
    <PerformancePanel v-if="store.perfVisible" />
    <VideoModal />

    <div v-if="loading" class="loading">
      <span class="spinner"></span>
      <span>场景加载中</span>
    </div>

    <div v-if="store.loadError" class="loading error">
      <span>园区数据加载失败</span>
      <span class="error-detail">{{ store.loadError }}</span>
      <span class="error-hint">请在项目目录执行 npm run build:data</span>
    </div>
  </section>
</template>

<style scoped lang="scss">
.scene-panel {
  position: relative;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-deep);
  box-shadow: var(--shadow-panel);
}

.cesium-container {
  position: absolute;
  inset: 0;
}

.scene-head {
  position: absolute;
  top: 14px;
  left: 16px;
  display: flex;
  align-items: center;
  gap: 10px;
  pointer-events: none;
}

.scene-title {
  padding: 6px 10px;
  border: 1px solid rgba(0, 229, 255, 0.22);
  border-radius: 3px;
  color: var(--text);
  font-size: 12px;
  letter-spacing: 0.08em;
  background: rgba(3, 12, 24, 0.66);
  backdrop-filter: blur(6px);
}

.scene-chip {
  padding: 4px 8px;
  border: 1px solid rgba(0, 229, 255, 0.18);
  border-radius: 3px;
  color: var(--primary);
  font-size: 10px;
  background: rgba(0, 229, 255, 0.06);
}

.level-switch {
  display: flex;
  gap: 2px;
  padding: 2px;
  border: 1px solid rgba(0, 229, 255, 0.18);
  border-radius: 3px;
  background: rgba(3, 12, 24, 0.72);
  pointer-events: auto;
  backdrop-filter: blur(6px);
}

.level-btn {
  padding: 5px 10px;
  border-radius: 2px;
  color: var(--text-dim);
  font-size: 11px;
  letter-spacing: 0.04em;
  transition: color 160ms ease, background 160ms ease;
}

.level-btn:hover:not(:disabled) {
  color: var(--text);
  background: rgba(0, 229, 255, 0.08);
}

.level-btn.active {
  color: var(--bg-deep);
  background: var(--primary);
  box-shadow: 0 0 10px rgba(0, 229, 255, 0.35);
}

.level-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.loading {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--text-dim);
  font-size: 12px;
  letter-spacing: 0.12em;
  background: var(--bg-deep);
  transition: opacity 240ms ease;
}

.loading.error {
  color: var(--alert);
}

.error-detail {
  max-width: 70%;
  color: var(--text-dim);
  letter-spacing: 0;
  text-align: center;
}

.error-hint {
  color: var(--text-dim);
  font-size: 11px;
  letter-spacing: 0;
}

.spinner {
  width: 28px;
  height: 28px;
  border: 2px solid rgba(0, 229, 255, 0.16);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: spin 900ms linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

:deep(.cesium-viewer-bottom) {
  right: 10px;
  bottom: 6px;
}

:deep(.cesium-widget-credits) {
  font-size: 10px;
}
</style>
