export type LayerKey = 'imagery' | 'buildings' | 'surroundings' | 'devices' | 'alerts' | 'poi'

export type ViewLevel = 'district' | 'campus' | 'building'

export type DeviceStatus = 'normal' | 'warning' | 'offline'

export type AlertLevel = 'high' | 'medium' | 'low'

export type AlertStatus = 'pending' | 'processing' | 'resolved'

export type DashboardMode = 'overview' | 'disposal' | 'tour'

export type BuildingKind =
  | 'office'
  | 'lab'
  | 'factory'
  | 'warehouse'
  | 'commercial'
  | 'residential'
  | 'utility'
  | 'public'

export type RoadKind = 'main' | 'secondary' | 'service' | 'walk'

export type PoiType = 'gate' | 'plaza' | 'parking' | 'leisure' | 'service'

export type ResourceType = 'fire' | 'medical' | 'team'

export type TrackKind = 'vehicle' | 'person'

// ---------------------------------------------------------------- 业务实体

export interface Building {
  id: string
  name: string
  district: string
  kind: BuildingKind
  floors: number
  height: number
  area: number
  deviceCount: number
  alertCount: number
  keyBuilding: boolean
  center: [number, number]
}

export interface Device {
  id: string
  name: string
  type: string
  buildingId: string
  buildingName: string
  floor: number
  status: DeviceStatus
  temperature: number
  current: number
  lon: number
  lat: number
}

export interface AlertItem {
  id: string
  time: string
  type: string
  level: AlertLevel
  status: AlertStatus
  buildingId: string
  buildingName: string
  deviceId: string
  deviceName: string
  lon: number
  lat: number
  /** 由模拟实时链路推送的告警标记，用于列表 NEW 标签 */
  pushed?: boolean
}

export interface ResourceItem {
  id: string
  name: string
  type: ResourceType
  distance: number
  lon: number
  lat: number
}

export interface CampusStats {
  buildingCount: number
  deviceCount: number
  onlineRate: number
  alertCount: number
}

export interface DeviceSummary {
  normal: number
  warning: number
  offline: number
}

export interface TrendData {
  times: string[]
  values: number[]
}

export interface TrackMeta {
  id: string
  name: string
  kind: TrackKind
  speed: number
  startTime: string
  pointCount: number
}

export interface TrackPoint {
  trackId: string
  seq: number
  lon: number
  lat: number
  time: string
  speed: number
  heading: number
}

export interface TrackDataset {
  tracks: TrackMeta[]
  points: TrackPoint[]
}

// ---------------------------------------------------------------- Step 3 业务交互

/** 处置闭环阶段：0 接警 / 1 确认 / 2 派发 / 3 到场 / 4 处理 / 5 归档 */
export type DisposalStage = 0 | 1 | 2 | 3 | 4 | 5

export interface DisposalRecord {
  stage: DisposalStage
  label: string
  time: string
  note: string
}

export interface RoutePath {
  resourceId: string
  resourceName: string
  /** 沿道路插值后的坐标序列（含起终点） */
  positions: Array<[number, number]>
  distanceKm: number
  /** 动画时长，毫秒 */
  duration: number
}

export type RealtimeStatus = 'connected' | 'reconnecting'

export interface RealtimeState {
  status: RealtimeStatus
  pushes: number
  lastEvent: string
  lastPushAt: number
  /** 已收到的事件 ID，用于展示去重结果 */
  duplicateDropped: number
}

export interface RealtimeDevicePayload {
  id: string
  temperature: number
  current: number
  status: DeviceStatus
}

// ---------------------------------------------------------------- Step 4 技术深度

export type QualityLevel = 'high' | 'balanced' | 'power'

export interface SceneMetrics {
  fps: number
  drawCalls: number
  triangles: number
  heapMB: number
}

export interface EffectState {
  boundaryFlow: boolean
  scan: boolean
  heatmap: boolean
}

// ---------------------------------------------------------------- Step 5 体验交付

export interface CameraPoint {
  id: string
  name: string
  buildingId: string
  buildingName: string
  lon: number
  lat: number
  height: number
  online: boolean
  resolution: string
}

export interface TourStep {
  key: string
  title: string
  desc: string
  duration: number
}

export interface TourState {
  active: boolean
  step: number
  progress: number
}

// ---------------------------------------------------------------- GeoJSON

export interface GeoPointGeometry {
  type: 'Point'
  coordinates: [number, number]
}

export interface GeoLineStringGeometry {
  type: 'LineString'
  coordinates: Array<[number, number]>
}

export interface GeoPolygonGeometry {
  type: 'Polygon'
  coordinates: Array<Array<[number, number]>>
}

export type GeoGeometry = GeoPointGeometry | GeoLineStringGeometry | GeoPolygonGeometry

export interface GeoFeature<G extends GeoGeometry, P> {
  type: 'Feature'
  geometry: G
  properties: P
}

export interface GeoFeatureCollection<G extends GeoGeometry, P> {
  type: 'FeatureCollection'
  features: Array<GeoFeature<G, P>>
}

export interface BoundaryProperties {
  id: string
  name: string
  kind: 'boundary'
}

export interface RoadProperties {
  id: string
  name: string
  kind: RoadKind
  width: number
}

export interface WaterProperties {
  id: string
  name: string
  kind: 'lake' | 'pond'
}

export interface PoiProperties {
  id: string
  name: string
  type: PoiType
}

export interface ResourceProperties {
  id: string
  name: string
  type: ResourceType
  distanceKm: number
}

export interface SurroundingProperties {
  id: string
  height: number
  center: [number, number]
}

export interface CampusSceneData {
  boundary: GeoFeatureCollection<GeoPolygonGeometry, BoundaryProperties>
  buildings: GeoFeatureCollection<GeoPolygonGeometry, Building>
  roads: GeoFeatureCollection<GeoLineStringGeometry, RoadProperties>
  water: GeoFeatureCollection<GeoPolygonGeometry, WaterProperties>
  poi: GeoFeatureCollection<GeoPointGeometry, PoiProperties>
  resources: GeoFeatureCollection<GeoPointGeometry, ResourceProperties>
  surroundings: GeoFeatureCollection<GeoPolygonGeometry, SurroundingProperties>
}
