import type { GeoFeatureCollection, GeoLineStringGeometry, RoadProperties } from '@/types/domain'

type Roads = GeoFeatureCollection<GeoLineStringGeometry, RoadProperties>

interface GraphNode {
  lon: number
  lat: number
  edges: Array<{ to: string; cost: number }>
}

export interface RoadGraph {
  nodes: Map<string, GraphNode>
}

const LON_METERS = 90000
const LAT_METERS = 111000

function metersBetween(a: [number, number], b: [number, number]): number {
  const dx = (a[0] - b[0]) * LON_METERS
  const dy = (a[1] - b[1]) * LAT_METERS
  return Math.hypot(dx, dy)
}

/** 顶点吸附到约 11m 的网格，让没有共享端点的相邻道路也能连通 */
function nodeKey([lon, lat]: [number, number]): string {
  return `${lon.toFixed(4)},${lat.toFixed(4)}`
}

export function buildRoadGraph(roads: Roads): RoadGraph {
  const nodes = new Map<string, GraphNode>()

  const ensure = ([lon, lat]: [number, number]): GraphNode => {
    const key = nodeKey([lon, lat])
    let node = nodes.get(key)
    if (!node) {
      node = { lon, lat, edges: [] }
      nodes.set(key, node)
    }
    return node
  }

  for (const feature of roads.features) {
    const coords = feature.geometry.coordinates
    for (let index = 0; index < coords.length - 1; index += 1) {
      const from = coords[index]
      const to = coords[index + 1]
      const fromNode = ensure(from)
      const toNode = ensure(to)
      const cost = metersBetween(from, to)
      fromNode.edges.push({ to: nodeKey(to), cost })
      toNode.edges.push({ to: nodeKey(from), cost })
    }
  }

  return { nodes }
}

function nearestNode(graph: RoadGraph, point: [number, number]): { key: string; cost: number } | null {
  let best: { key: string; cost: number } | null = null
  for (const [key, node] of graph.nodes) {
    const cost = metersBetween(point, [node.lon, node.lat])
    if (!best || cost < best.cost) best = { key, cost }
  }
  return best
}

/** Dijkstra：道路网络节点量级很小，用数组扫描即可 */
export function findRoadRoute(
  graph: RoadGraph,
  from: [number, number],
  to: [number, number],
): Array<[number, number]> {
  const start = nearestNode(graph, from)
  const end = nearestNode(graph, to)
  if (!start || !end) return [from, to]

  const distance = new Map<string, number>()
  const previous = new Map<string, string>()
  const visited = new Set<string>()
  distance.set(start.key, 0)

  while (visited.size < graph.nodes.size) {
    let current: string | null = null
    let currentCost = Number.POSITIVE_INFINITY
    for (const [key, cost] of distance) {
      if (!visited.has(key) && cost < currentCost) {
        current = key
        currentCost = cost
      }
    }
    if (!current) break
    if (current === end.key) break
    visited.add(current)

    const node = graph.nodes.get(current)
    if (!node) continue
    for (const edge of node.edges) {
      if (visited.has(edge.to)) continue
      const next = currentCost + edge.cost
      const known = distance.get(edge.to)
      if (known === undefined || next < known) {
        distance.set(edge.to, next)
        previous.set(edge.to, current)
      }
    }
  }

  if (!distance.has(end.key)) return [from, to]

  const path: Array<[number, number]> = []
  let cursor: string | undefined = end.key
  while (cursor) {
    const node = graph.nodes.get(cursor)
    if (node) path.unshift([node.lon, node.lat])
    cursor = previous.get(cursor)
  }

  path[0] = from
  path[path.length - 1] = to
  return path
}

export function polylineLengthKm(positions: Array<[number, number]>): number {
  let total = 0
  for (let index = 1; index < positions.length; index += 1) {
    total += metersBetween(positions[index - 1], positions[index])
  }
  return total / 1000
}
