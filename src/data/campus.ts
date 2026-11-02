import type { AlertItem, CampusSceneData, Device, TrackDataset } from '@/types/domain'

const DATA_ROOT = '/data'

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${DATA_ROOT}/${path}`)
  if (!response.ok) {
    throw new Error(`数据加载失败：${path}（HTTP ${response.status}）`)
  }
  return (await response.json()) as T
}

let scenePromise: Promise<CampusSceneData> | null = null

/** 园区底图数据：边界 / 建筑 / 道路 / 水系 / POI / 应急资源点 */
export function loadCampusScene(): Promise<CampusSceneData> {
  if (!scenePromise) {
    scenePromise = Promise.all([
      fetchJson<CampusSceneData['boundary']>('campus/boundary.geojson'),
      fetchJson<CampusSceneData['buildings']>('campus/buildings.geojson'),
      fetchJson<CampusSceneData['roads']>('campus/roads.geojson'),
      fetchJson<CampusSceneData['water']>('campus/water.geojson'),
      fetchJson<CampusSceneData['poi']>('campus/poi.geojson'),
      fetchJson<CampusSceneData['resources']>('campus/resources.geojson'),
      fetchJson<CampusSceneData['surroundings']>('campus/surroundings.geojson'),
    ]).then(([boundary, buildings, roads, water, poi, resources, surroundings]) => ({
      boundary,
      buildings,
      roads,
      water,
      poi,
      resources,
      surroundings,
    }))
  }
  return scenePromise
}

/** 业务数据：设备与告警（轨迹数据按需加载，见 public/data/business/tracks.json） */
export async function loadBusinessData(): Promise<{ devices: Device[]; alerts: AlertItem[] }> {
  const [devices, alerts] = await Promise.all([
    fetchJson<Device[]>('business/devices.json'),
    fetchJson<AlertItem[]>('business/alerts.json'),
  ])
  return { devices, alerts }
}

let trackPromise: Promise<TrackDataset> | null = null

/** 轨迹回放数据：6 条轨迹 / 1200 点 */
export function loadTracks(): Promise<TrackDataset> {
  if (!trackPromise) {
    trackPromise = fetchJson<TrackDataset>('business/tracks.json')
  }
  return trackPromise
}
