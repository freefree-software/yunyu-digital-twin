#!/usr/bin/env node
/**
 * 云屿园区 Step 1 数据生成脚本
 *
 * 产出：
 *   public/data/campus/*.geojson      园区底图数据（边界 / 建筑 / 道路 / 水系 / POI / 资源点）
 *   public/data/business/devices.json 200 台设备
 *   public/data/business/alerts.json  50 条告警
 *   public/data/business/tracks.json  10 条轨迹 / 3000 个轨迹点
 *   public/data/manifest.json         数据清单与统计
 *
 * 坐标：WGS84。以 (120.4145, 36.0545) 为原点，局部米制坐标系换算：
 *   lon = 120.4145 + x / 90000，lat = 36.0545 + y / 111000
 * 随机数使用固定种子，多次执行结果完全一致。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const OUT_DIR = resolve(ROOT, 'public/data')

const SEED = 20261029
const LON0 = 120.4145
const LAT0 = 36.0545
const M_PER_DEG_LON = 90000
const M_PER_DEG_LAT = 111000

const PARK_BOUNDS = {
  west: 120.4145,
  south: 36.0545,
  east: 120.426,
  north: 36.0645,
}

// ---------------------------------------------------------------- 基础工具

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(SEED)
const randFloat = (min, max) => min + rand() * (max - min)
const randInt = (min, max) => Math.floor(randFloat(min, max + 1))
const pick = (list) => list[Math.floor(rand() * list.length)]

const toLon = (x) => Number((LON0 + x / M_PER_DEG_LON).toFixed(7))
const toLat = (y) => Number((LAT0 + y / M_PER_DEG_LAT).toFixed(7))
const xyToLonLat = (x, y) => [toLon(x), toLat(y)]

const round = (value, digits = 1) => Number(value.toFixed(digits))

function formatTime(totalSeconds) {
  const s = ((Math.round(totalSeconds) % 86400) + 86400) % 86400
  const hh = String(Math.floor(s / 3600)).padStart(2, '0')
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(Math.floor(s % 60)).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

const timeToSeconds = (hhmmss) => {
  const [h, m, s] = hhmmss.split(':').map(Number)
  return h * 3600 + m * 60 + s
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}

// ---------------------------------------------------------------- 园区布局

const DISTRICTS = [
  {
    key: 'rd-west',
    name: '研发西区',
    kind: 'office',
    rect: [70, 770, 340, 1040],
    cols: 4,
    rows: 5,
    height: [26, 54],
    keyCount: 3,
  },
  {
    key: 'rd-north',
    name: '研发北区',
    kind: 'office',
    rect: [360, 770, 700, 1040],
    cols: 5,
    rows: 3,
    height: [30, 58],
    keyCount: 3,
  },
  {
    key: 'innovation',
    name: '创新孵化区',
    kind: 'lab',
    rect: [730, 770, 1000, 1040],
    cols: 4,
    rows: 4,
    height: [22, 44],
    keyCount: 3,
  },
  {
    key: 'energy',
    name: '能源区',
    kind: 'utility',
    rect: [70, 440, 340, 590],
    cols: 2,
    rows: 2,
    height: [8, 15],
    keyCount: 0,
  },
  {
    key: 'datacenter',
    name: '数据中心区',
    kind: 'utility',
    rect: [70, 610, 340, 750],
    cols: 2,
    rows: 2,
    height: [14, 24],
    keyCount: 1,
  },
  {
    key: 'lakeside',
    name: '滨湖配套',
    kind: 'public',
    rect: [360, 610, 700, 750],
    cols: 3,
    rows: 2,
    height: [10, 20],
    keyCount: 1,
  },
  {
    key: 'manufacture',
    name: '智造东区',
    kind: 'factory',
    rect: [730, 440, 1000, 750],
    cols: 3,
    rows: 4,
    height: [12, 22],
    keyCount: 0,
  },
  {
    key: 'portal',
    name: '门户商业区',
    kind: 'commercial',
    rect: [70, 100, 340, 410],
    cols: 4,
    rows: 5,
    height: [18, 36],
    keyCount: 1,
  },
  {
    key: 'living',
    name: '生活配套区',
    kind: 'residential',
    rect: [360, 100, 700, 410],
    cols: 4,
    rows: 4,
    height: [18, 32],
    keyCount: 0,
  },
  {
    key: 'logistics',
    name: '仓储物流区',
    kind: 'warehouse',
    rect: [730, 100, 1000, 410],
    cols: 3,
    rows: 5,
    height: [9, 16],
    keyCount: 0,
  },
]

const KIND_SPEC = {
  office: { width: [28, 42], depth: [24, 34] },
  lab: { width: [30, 44], depth: [24, 36] },
  factory: { width: [56, 70], depth: [34, 46] },
  warehouse: { width: [60, 78], depth: [38, 48] },
  commercial: { width: [36, 52], depth: [30, 42] },
  residential: { width: [36, 50], depth: [20, 30] },
  utility: { width: [28, 42], depth: [22, 34] },
  public: { width: [44, 64], depth: [30, 44] },
}

const DEVICE_TYPES = {
  office: ['烟感', '空调', '配电', '门禁', '摄像头'],
  lab: ['烟感', '空调', '配电', '摄像头', '门禁'],
  factory: ['烟感', '配电', '水泵', '摄像头'],
  warehouse: ['烟感', '配电', '摄像头', '水泵'],
  commercial: ['烟感', '空调', '门禁', '摄像头'],
  residential: ['烟感', '门禁', '水泵', '配电'],
  utility: ['配电', '水泵', '电表', '烟感'],
  public: ['烟感', '空调', '摄像头', '门禁'],
}

// ---------------------------------------------------------------- 边界 / 水系

const BOUNDARY_METERS = [
  [0, 80],
  [80, 0],
  [955, 0],
  [1035, 80],
  [1035, 1030],
  [955, 1110],
  [80, 1110],
  [0, 1030],
  [0, 80],
]

const LAKE_CENTER = { x: 528, y: 515 }
const LAKE_RADIUS = { x: 152, y: 68 }

function buildLakeRing() {
  const points = []
  const steps = 32
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2
    const wobble = 1 + 0.06 * Math.sin(angle * 3) + 0.03 * Math.sin(angle * 5 + 1)
    points.push([
      LAKE_CENTER.x + LAKE_RADIUS.x * Math.cos(angle) * wobble,
      LAKE_CENTER.y + LAKE_RADIUS.y * Math.sin(angle) * wobble,
    ])
  }
  points.push(points[0])
  return points
}

// ---------------------------------------------------------------- 道路

const RING_ROAD = [
  [55, 125],
  [125, 55],
  [910, 55],
  [980, 125],
  [980, 985],
  [910, 1055],
  [125, 1055],
  [55, 985],
  [55, 125],
]

const ROADS = [
  { id: 'RD-001', name: '园区环路', kind: 'main', width: 12, points: RING_ROAD },
  { id: 'RD-002', name: '研发大道', kind: 'secondary', width: 9, points: [[350, 55], [350, 1055]] },
  { id: 'RD-003', name: '智造大道', kind: 'secondary', width: 9, points: [[710, 55], [710, 1055]] },
  { id: 'RD-004', name: '云屿中路', kind: 'secondary', width: 9, points: [[55, 430], [980, 430]] },
  { id: 'RD-005', name: '云屿北路', kind: 'secondary', width: 9, points: [[55, 760], [980, 760]] },
  { id: 'RD-006', name: '南门连接路', kind: 'service', width: 5, points: [[518, 0], [518, 55]] },
  { id: 'RD-007', name: '北门连接路', kind: 'service', width: 5, points: [[518, 1110], [518, 1055]] },
  {
    id: 'RD-008',
    name: '环湖步道',
    kind: 'walk',
    width: 3,
    points: buildLakeRing().slice(0, -1).map(([x, y]) => {
      const factor = 1.09
      return [LAKE_CENTER.x + (x - LAKE_CENTER.x) * factor, LAKE_CENTER.y + (y - LAKE_CENTER.y) * factor]
    }),
  },
]

// 各片区内支路：沿地块网格的中缝布置，供后续路径规划使用
let serviceRoadIndex = 9
for (const district of DISTRICTS) {
  const [x0, y0, x1, y1] = district.rect
  const plotW = (x1 - x0) / district.cols
  const plotH = (y1 - y0) / district.rows
  const midX = x0 + plotW * Math.floor(district.cols / 2)
  const midY = y0 + plotH * Math.floor(district.rows / 2)
  ROADS.push({
    id: `RD-${String(serviceRoadIndex).padStart(3, '0')}`,
    name: `${district.name}纵支路`,
    kind: 'service',
    width: 4,
    points: [[midX, y0 + 4], [midX, y1 - 4]],
  })
  serviceRoadIndex += 1
  ROADS.push({
    id: `RD-${String(serviceRoadIndex).padStart(3, '0')}`,
    name: `${district.name}横支路`,
    kind: 'service',
    width: 4,
    points: [[x0 + 4, midY], [x1 - 4, midY]],
  })
  serviceRoadIndex += 1
}

// ---------------------------------------------------------------- 建筑

const buildings = []
let buildingSeq = 0

for (const district of DISTRICTS) {
  const [x0, y0, x1, y1] = district.rect
  const plotW = (x1 - x0) / district.cols
  const plotH = (y1 - y0) / district.rows
  const spec = KIND_SPEC[district.kind]

  for (let row = 0; row < district.rows; row += 1) {
    for (let col = 0; col < district.cols; col += 1) {
      buildingSeq += 1
      const cx = x0 + (col + 0.5) * plotW + randFloat(-1.2, 1.2)
      const cy = y0 + (row + 0.5) * plotH + randFloat(-1.2, 1.2)
      const width = Math.min(randFloat(spec.width[0], spec.width[1]), plotW - 14)
      const depth = Math.min(randFloat(spec.depth[0], spec.depth[1]), plotH - 14)
      const height = Math.round(randFloat(district.height[0], district.height[1]))
      const floors = Math.max(1, Math.round(height / 3.6))
      const area = Math.round(width * depth * floors * 0.78)

      const ring = [
        [cx - width / 2, cy - depth / 2],
        [cx + width / 2, cy - depth / 2],
        [cx + width / 2, cy + depth / 2],
        [cx - width / 2, cy + depth / 2],
        [cx - width / 2, cy - depth / 2],
      ].map(([x, y]) => xyToLonLat(x, y))

      buildings.push({
        id: `B-${String(buildingSeq).padStart(3, '0')}`,
        name: `${buildingSeq} 号楼`,
        district: district.name,
        kind: district.kind,
        floors,
        height,
        area,
        deviceCount: 0,
        alertCount: 0,
        keyBuilding: false,
        center: xyToLonLat(cx, cy),
        footprint: { cx, cy, width, depth },
        ring,
      })
    }
  }
}

assert(buildings.length === 128, `建筑数量应为 128，实际 ${buildings.length}`)

// 重点楼宇：各片区取高度最高的若干栋
for (const district of DISTRICTS) {
  if (!district.keyCount) continue
  const candidates = buildings
    .filter((item) => item.district === district.name)
    .sort((a, b) => b.height - a.height)
  candidates.slice(0, district.keyCount).forEach((item) => {
    item.keyBuilding = true
  })
}

const keyBuildingCount = buildings.filter((item) => item.keyBuilding).length
assert(keyBuildingCount === 12, `重点楼宇应为 12 栋，实际 ${keyBuildingCount}`)

// ---------------------------------------------------------------- 设备

const ANCHOR_BUILDING_ID = 'B-003'
const anchorBuilding = buildings.find((item) => item.id === ANCHOR_BUILDING_ID)
assert(Boolean(anchorBuilding), '锚点楼栋 B-003 不存在')

const TEMP_RANGE = {
  烟感: [26, 34],
  空调: [18, 26],
  配电: [34, 46],
  水泵: [28, 38],
  门禁: [24, 30],
  摄像头: [28, 38],
  电表: [30, 40],
}

const CURRENT_RANGE = {
  配电: [8, 16],
  水泵: [4, 9],
  空调: [2, 7],
  电表: [1, 4],
  烟感: [0.1, 0.5],
  门禁: [0.2, 0.6],
  摄像头: [0.3, 0.8],
}

function createDevice(building, type, floor, seqInBuilding) {
  const offsetX = randFloat(-building.footprint.width / 2 + 3, building.footprint.width / 2 - 3)
  const offsetY = randFloat(-building.footprint.depth / 2 + 3, building.footprint.depth / 2 - 3)
  const [lon, lat] = xyToLonLat(building.footprint.cx + offsetX, building.footprint.cy + offsetY)
  return {
    id: '',
    name: `${floor}F ${type}-${String(seqInBuilding).padStart(2, '0')}`,
    type,
    buildingId: building.id,
    buildingName: building.name,
    floor,
    status: 'normal',
    temperature: 0,
    current: 0,
    lon,
    lat,
  }
}

const devices = []
const perBuildingCounter = new Map()
const nextSeqInBuilding = (building) => {
  const next = (perBuildingCounter.get(building.id) ?? 0) + 1
  perBuildingCounter.set(building.id, next)
  return next
}

// 固定锚点：3 号楼 2F 烟感-03（与演示脚本保持一致）
devices.push({
  id: 'D-001',
  name: '2F 烟感-03',
  type: '烟感',
  buildingId: anchorBuilding.id,
  buildingName: anchorBuilding.name,
  floor: 2,
  status: 'warning',
  temperature: 42.6,
  current: 0.4,
  lon: xyToLonLat(anchorBuilding.footprint.cx + 4, anchorBuilding.footprint.cy + 3)[0],
  lat: xyToLonLat(anchorBuilding.footprint.cx + 4, anchorBuilding.footprint.cy + 3)[1],
})
perBuildingCounter.set(anchorBuilding.id, 3)

// 重点楼宇保底 1 台设备，其余按面积加权，避免全园区设备点过密
for (const building of buildings.filter((item) => item.keyBuilding)) {
  const type = pick(DEVICE_TYPES[building.kind])
  const floor = randInt(1, building.floors)
  devices.push(createDevice(building, type, floor, nextSeqInBuilding(building)))
}

// 剩余设备按建筑面积加权分配
const weightedBuildings = buildings.flatMap((building) => {
  const weight =
    Math.round(building.area / 900) + (building.keyBuilding ? 3 : 0) + (building.kind === 'office' ? 2 : 1)
  return Array.from({ length: weight }, () => building)
})

while (devices.length < 90) {
  const building = pick(weightedBuildings)
  const type = pick(DEVICE_TYPES[building.kind])
  const floor = randInt(1, building.floors)
  devices.push(createDevice(building, type, floor, nextSeqInBuilding(building)))
}

assert(devices.length === 90, `设备数量应为 90，实际 ${devices.length}`)

// 设备状态：5 预警 / 2 离线 / 83 正常
const statusPool = devices.slice(1)
for (let i = statusPool.length - 1; i > 0; i -= 1) {
  const j = Math.floor(rand() * (i + 1))
  ;[statusPool[i], statusPool[j]] = [statusPool[j], statusPool[i]]
}
statusPool.forEach((device, index) => {
  if (index < 4) device.status = 'warning'
  else if (index < 6) device.status = 'offline'
})

devices.forEach((device, index) => {
  device.id = `D-${String(index + 1).padStart(3, '0')}`
  const [tempMin, tempMax] = TEMP_RANGE[device.type] ?? [24, 34]
  const [curMin, curMax] = CURRENT_RANGE[device.type] ?? [0.2, 1]

  if (device.status === 'offline') {
    device.temperature = 0
    device.current = 0
    return
  }

  let temperature = randFloat(tempMin, tempMax)
  let current = randFloat(curMin, curMax)
  if (device.status === 'warning') {
    temperature += randFloat(4, 10)
    current *= randFloat(1.05, 1.25)
  }
  device.temperature = round(temperature, 1)
  device.current = round(current, 2)
})

// 回填每栋楼的设备数量
const deviceCountByBuilding = new Map()
for (const device of devices) {
  deviceCountByBuilding.set(device.buildingId, (deviceCountByBuilding.get(device.buildingId) ?? 0) + 1)
}
for (const building of buildings) {
  building.deviceCount = deviceCountByBuilding.get(building.id) ?? 0
}

// ---------------------------------------------------------------- 告警

const ALERT_TYPE_BY_DEVICE = {
  烟感: [
    ['烟感报警', 'high'],
    ['烟感告警', 'low'],
  ],
  配电: [
    ['电流越限', 'medium'],
    ['配电温度偏高', 'high'],
  ],
  水泵: [['水压异常', 'medium']],
  空调: [
    ['温度异常', 'medium'],
    ['设备离线', 'low'],
  ],
  门禁: [
    ['越界告警', 'high'],
    ['门禁异常', 'low'],
  ],
  摄像头: [
    ['视频遮挡', 'low'],
    ['设备离线', 'medium'],
  ],
  电表: [['用电异常', 'medium']],
}

const alertPool = devices.slice(1)
for (let i = alertPool.length - 1; i > 0; i -= 1) {
  const j = Math.floor(rand() * (i + 1))
  ;[alertPool[i], alertPool[j]] = [alertPool[j], alertPool[i]]
}

const alerts = []
let cursor = timeToSeconds('14:31:22')
for (let i = 0; i < 28; i += 1) {
  if (i > 0) cursor -= randInt(5, 9) * 60

  const device = i === 0 ? devices[0] : alertPool[i - 1]
  const candidates = ALERT_TYPE_BY_DEVICE[device.type] ?? [['设备异常', 'medium']]
  const [type, level] = i === 0 ? ['烟感报警', 'high'] : pick(candidates)
  const status = i < 4 ? 'pending' : i < 7 ? 'processing' : 'resolved'

  alerts.push({
    id: `A-${String(i + 1).padStart(3, '0')}`,
    time: formatTime(cursor),
    type,
    level,
    status,
    buildingId: device.buildingId,
    buildingName: device.buildingName,
    deviceId: device.id,
    deviceName: device.name,
    lon: device.lon,
    lat: device.lat,
  })
}

assert(alerts.length === 28, `告警数量应为 28，实际 ${alerts.length}`)
assert(alerts[0].buildingId === 'B-003' && alerts[0].status === 'pending', '首条告警应为 3 号楼待处置烟感报警')

// 回填每栋楼的告警数量
const alertCountByBuilding = new Map()
for (const alert of alerts) {
  alertCountByBuilding.set(alert.buildingId, (alertCountByBuilding.get(alert.buildingId) ?? 0) + 1)
}
for (const building of buildings) {
  building.alertCount = alertCountByBuilding.get(building.id) ?? 0
}

// ---------------------------------------------------------------- 轨迹

const PARK_CENTER = { x: 517.5, y: 555 }

function offsetRing(inset) {
  return RING_ROAD.map(([x, y]) => {
    const dx = x - PARK_CENTER.x
    const dy = y - PARK_CENTER.y
    const distance = Math.hypot(dx, dy)
    if (distance === 0) return [x, y]
    const factor = Math.max(0, (distance - inset) / distance)
    return [PARK_CENTER.x + dx * factor, PARK_CENTER.y + dy * factor]
  })
}

function buildEllipsePath(cx, cy, rx, ry, steps) {
  const points = []
  for (let i = 0; i <= steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2
    points.push([cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)])
  }
  return points
}

const LOOP_AVENUE_A = [[350, 55], [350, 1055], [710, 1055], [710, 55], [350, 55]]
const LOOP_AVENUE_B = [[55, 430], [980, 430], [980, 760], [55, 760], [55, 430]]
const LOOP_LAKE = buildEllipsePath(LAKE_CENTER.x, LAKE_CENTER.y, LAKE_RADIUS.x + 14, LAKE_RADIUS.y + 16, 72)

const TRACK_DEFS = [
  { id: 'T-001', name: '巡逻车-01', kind: 'vehicle', speed: 7.5, start: '08:12:00', path: offsetRing(4) },
  {
    id: 'T-002',
    name: '应急车-02',
    kind: 'vehicle',
    speed: 9,
    start: '09:03:00',
    path: offsetRing(-4),
    reverse: true,
  },
  { id: 'T-003', name: '物流车-03', kind: 'vehicle', speed: 6.2, start: '10:20:00', path: LOOP_AVENUE_B, reverse: true },
  { id: 'T-004', name: '安保车-04', kind: 'vehicle', speed: 8, start: '11:05:00', path: LOOP_AVENUE_A },
  { id: 'T-006', name: '巡更员-01', kind: 'person', speed: 1.4, start: '08:40:00', path: offsetRing(-10) },
  { id: 'T-008', name: '保洁员-03', kind: 'person', speed: 1.1, start: '10:10:00', path: LOOP_LAKE },
]

const POINTS_PER_TRACK = 200
const trackPoints = []
const tracks = []

for (const def of TRACK_DEFS) {
  const path = def.reverse ? [...def.path].reverse() : def.path
  const segmentLengths = []
  let totalLength = 0
  for (let i = 0; i < path.length - 1; i += 1) {
    const length = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1])
    segmentLengths.push(length)
    totalLength += length
  }

  const spacing = totalLength / POINTS_PER_TRACK
  const startSeconds = timeToSeconds(def.start)
  const deltaSeconds = spacing / def.speed

  let segmentIndex = 0
  let segmentStart = 0

  for (let i = 0; i < POINTS_PER_TRACK; i += 1) {
    const target = i * spacing
    while (segmentIndex < segmentLengths.length - 1 && segmentStart + segmentLengths[segmentIndex] < target) {
      segmentStart += segmentLengths[segmentIndex]
      segmentIndex += 1
    }
    const segmentLength = segmentLengths[segmentIndex] || 1
    const t = Math.min(1, (target - segmentStart) / segmentLength)
    const [x0, y0] = path[segmentIndex]
    const [x1, y1] = path[segmentIndex + 1]
    const x = x0 + (x1 - x0) * t
    const y = y0 + (y1 - y0) * t
    const heading = ((Math.atan2(x1 - x0, y1 - y0) * 180) / Math.PI + 360) % 360
    const [lon, lat] = xyToLonLat(x, y)

    trackPoints.push({
      trackId: def.id,
      seq: i,
      lon,
      lat,
      time: formatTime(startSeconds + i * deltaSeconds),
      speed: round(def.speed + randFloat(-0.4, 0.4), 1),
      heading: Math.round(heading),
    })
  }

  tracks.push({
    id: def.id,
    name: def.name,
    kind: def.kind,
    speed: def.speed,
    startTime: def.start,
    pointCount: POINTS_PER_TRACK,
  })
}

assert(trackPoints.length === 1200, `轨迹点应为 1200，实际 ${trackPoints.length}`)

// ---------------------------------------------------------------- POI / 资源点

const POIS = [
  { id: 'P-001', name: '园区南门', type: 'gate', x: 518, y: 14 },
  { id: 'P-002', name: '园区北门', type: 'gate', x: 518, y: 1096 },
  { id: 'P-003', name: '园区西门', type: 'gate', x: 14, y: 555 },
  { id: 'P-004', name: '园区东门', type: 'gate', x: 1021, y: 555 },
  { id: 'P-005', name: '中央广场', type: 'plaza', x: 520, y: 600 },
  { id: 'P-006', name: '湖滨步道', type: 'leisure', x: 424, y: 592 },
  { id: 'P-007', name: '观景平台', type: 'leisure', x: 648, y: 594 },
  { id: 'P-008', name: '地面停车场 A', type: 'parking', x: 450, y: 78 },
  { id: 'P-009', name: '地面停车场 B', type: 'parking', x: 700, y: 1078 },
  { id: 'P-010', name: '充电站', type: 'service', x: 880, y: 1078 },
  { id: 'P-011', name: '员工球场', type: 'leisure', x: 700, y: 418 },
]

const RESOURCES = [
  { id: 'R-001', name: '园区消防站', type: 'fire', x: 900, y: 80 },
  { id: 'R-002', name: '园区医疗点', type: 'medical', x: 80, y: 80 },
  { id: 'R-003', name: '应急抢险队', type: 'team', x: 520, y: 600 },
]

const anchorXY = {
  x: (anchorBuilding.center[0] - LON0) * M_PER_DEG_LON,
  y: (anchorBuilding.center[1] - LAT0) * M_PER_DEG_LAT,
}

for (const resource of RESOURCES) {
  resource.distanceKm = round(Math.hypot(resource.x - anchorXY.x, resource.y - anchorXY.y) / 1000, 1)
}

// ---------------------------------------------------------------- 周边 1km 楼宇
// 无在线底图可用（CARTO / Esri / Stadia 均受限），按《设计方案》16.4 降级：
// 用确定性脚本生成园区外 1km 环带内的低层楼块，作为三维场景的城市肌理。

const SURROUND_BAND = 1000
const SURROUND_CELL = 76
const SURROUND_KEEP_RATIO = 0.09

const surroundings = []
let surroundSeq = 0

for (let gy = -SURROUND_BAND; gy < 1110 + SURROUND_BAND; gy += SURROUND_CELL) {
  for (let gx = -SURROUND_BAND; gx < 1035 + SURROUND_BAND; gx += SURROUND_CELL) {
    const cx = gx + SURROUND_CELL / 2 + randFloat(-6, 6)
    const cy = gy + SURROUND_CELL / 2 + randFloat(-6, 6)
    const dx = Math.max(0 - cx, 0, cx - 1035)
    const dy = Math.max(0 - cy, 0, cy - 1110)
    const distance = Math.hypot(dx, dy)
    if (distance === 0 || distance > SURROUND_BAND) continue
    if (rand() > SURROUND_KEEP_RATIO) continue

    surroundSeq += 1
    const width = randFloat(26, 58)
    const depth = randFloat(22, 48)
    // 越靠近园区，楼层越高；外圈逐步过渡为低层配套
    const height = Math.round(randFloat(8, distance < 400 ? 42 : distance < 700 ? 30 : 20))
    const angle = randFloat(-0.14, 0.14)
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)

    const ring = [
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [width / 2, depth / 2],
      [-width / 2, depth / 2],
      [-width / 2, -depth / 2],
    ].map(([ox, oy]) => xyToLonLat(cx + ox * cos - oy * sin, cy + ox * sin + oy * cos))

    surroundings.push({
      id: `S-${String(surroundSeq).padStart(3, '0')}`,
      height,
      center: xyToLonLat(cx, cy),
      ring,
    })
  }
}

assert(
  surroundings.length >= 90 && surroundings.length <= 140,
  `周边楼宇应为 90–140 栋，实际 ${surroundings.length}`,
)

// ---------------------------------------------------------------- 输出

const featureCollection = (features) => ({ type: 'FeatureCollection', features })

const boundaryFeature = {
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [BOUNDARY_METERS.map(([x, y]) => xyToLonLat(x, y))],
  },
  properties: { id: 'PARK-001', name: '云屿园区', kind: 'boundary' },
}

const buildingFeatures = buildings.map((building) => ({
  type: 'Feature',
  geometry: {
    type: 'Polygon',
    coordinates: [building.ring],
  },
  properties: {
    id: building.id,
    name: building.name,
    district: building.district,
    kind: building.kind,
    floors: building.floors,
    height: building.height,
    area: building.area,
    deviceCount: building.deviceCount,
    alertCount: building.alertCount,
    keyBuilding: building.keyBuilding,
    center: building.center,
  },
}))

const roadFeatures = ROADS.map((road) => ({
  type: 'Feature',
  geometry: {
    type: 'LineString',
    coordinates: road.points.map(([x, y]) => xyToLonLat(x, y)),
  },
  properties: {
    id: road.id,
    name: road.name,
    kind: road.kind,
    width: road.width,
  },
}))

const waterFeatures = [
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [buildLakeRing().map(([x, y]) => xyToLonLat(x, y))],
    },
    properties: { id: 'W-001', name: '云屿湖', kind: 'lake' },
  },
]

const poiFeatures = POIS.map((poi) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: xyToLonLat(poi.x, poi.y) },
  properties: { id: poi.id, name: poi.name, type: poi.type },
}))

const surroundFeatures = surroundings.map((item) => ({
  type: 'Feature',
  geometry: { type: 'Polygon', coordinates: [item.ring] },
  properties: {
    id: item.id,
    height: item.height,
    center: item.center,
  },
}))

const resourceFeatures = RESOURCES.map((resource) => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates: xyToLonLat(resource.x, resource.y) },
  properties: {
    id: resource.id,
    name: resource.name,
    type: resource.type,
    distanceKm: resource.distanceKm,
  },
}))

const manifest = {
  name: '云屿园区数据资产（Step 1 + Step 2 周边楼宇）',
  version: '1.2.0',
  seed: SEED,
  generatedAt: '2026-10-29',
  crs: 'WGS84 (EPSG:4326)',
  origin: { lon: LON0, lat: LAT0 },
  bbox: [PARK_BOUNDS.west, PARK_BOUNDS.south, PARK_BOUNDS.east, PARK_BOUNDS.north],
  counts: {
    buildings: buildings.length,
    keyBuildings: keyBuildingCount,
    roads: ROADS.length,
    water: waterFeatures.length,
    poi: POIS.length,
    resources: RESOURCES.length,
    surroundings: surroundings.length,
    devices: devices.length,
    alerts: alerts.length,
    tracks: tracks.length,
    trackPoints: trackPoints.length,
  },
  files: {
    boundary: 'campus/boundary.geojson',
    buildings: 'campus/buildings.geojson',
    roads: 'campus/roads.geojson',
    water: 'campus/water.geojson',
    poi: 'campus/poi.geojson',
    resources: 'campus/resources.geojson',
    surroundings: 'campus/surroundings.geojson',
    devices: 'business/devices.json',
    alerts: 'business/alerts.json',
    tracks: 'business/tracks.json',
  },
}

const writeJson = async (relativePath, data, pretty = true) => {
  const target = resolve(OUT_DIR, relativePath)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, JSON.stringify(data, null, pretty ? 2 : 0), 'utf8')
  return target
}

await Promise.all([
  writeJson('campus/boundary.geojson', featureCollection([boundaryFeature])),
  writeJson('campus/buildings.geojson', featureCollection(buildingFeatures)),
  writeJson('campus/roads.geojson', featureCollection(roadFeatures)),
  writeJson('campus/water.geojson', featureCollection(waterFeatures)),
  writeJson('campus/poi.geojson', featureCollection(poiFeatures)),
  writeJson('campus/resources.geojson', featureCollection(resourceFeatures)),
  writeJson('campus/surroundings.geojson', featureCollection(surroundFeatures)),
  writeJson('business/devices.json', devices),
  writeJson('business/alerts.json', alerts),
  writeJson('business/tracks.json', { tracks, points: trackPoints }, false),
  writeJson('manifest.json', manifest),
])

const statusCount = {
  normal: devices.filter((item) => item.status === 'normal').length,
  warning: devices.filter((item) => item.status === 'warning').length,
  offline: devices.filter((item) => item.status === 'offline').length,
}

const unresolved = alerts.filter((item) => item.status !== 'resolved').length

console.log('云屿园区数据生成完成')
console.log(`  建筑 ${buildings.length} 栋（重点楼宇 ${keyBuildingCount} 栋）`)
console.log(`  道路 ${ROADS.length} 条 / POI ${POIS.length} 个 / 资源点 ${RESOURCES.length} 个`)
console.log(`  周边 1km 楼宇 ${surroundings.length} 栋`)
console.log(`  设备 ${devices.length} 台（正常 ${statusCount.normal} / 预警 ${statusCount.warning} / 离线 ${statusCount.offline}）`)
console.log(`  告警 ${alerts.length} 条（未处置 ${unresolved} 条）`)
console.log(`  轨迹 ${tracks.length} 条 / ${trackPoints.length} 个轨迹点`)
console.log(`  输出目录 ${OUT_DIR}`)
