<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useDashboardStore } from '@/stores/dashboard'

export interface ViewRect {
  west: number
  south: number
  east: number
  north: number
}

export interface CameraPose {
  lon: number
  lat: number
  heading: number
}

const emit = defineEmits<{ fly: [lon: number, lat: number] }>()

const store = useDashboardStore()

const el = ref<HTMLDivElement | null>(null)
const map = shallowRef<L.Map | null>(null)
let viewRect: L.Rectangle | null = null
let cameraMarker: L.CircleMarker | null = null
let cameraLine: L.Polyline | null = null
let focusMarker: L.CircleMarker | null = null
let focusRing: L.CircleMarker | null = null
let clickCleanup: (() => void) | undefined

const PARK_CENTER: L.LatLngTuple = [36.0595, 120.42025]

const ROAD_WEIGHT: Record<string, number> = {
  main: 2.4,
  secondary: 1.8,
  service: 1.1,
  walk: 0.9,
}

const toLatLng = ([lon, lat]: [number, number]): L.LatLngTuple => [lat, lon]

function buildLayers(instance: L.Map) {
  const scene = store.scene
  if (!scene) return

  const bounds = L.latLngBounds([])

  for (const feature of scene.surroundings.features) {
    const ring = feature.geometry.coordinates[0].map(toLatLng)
    L.polygon(ring, {
      color: '#1d4258',
      weight: 0.5,
      fillColor: '#12283a',
      fillOpacity: 0.85,
      interactive: false,
    }).addTo(instance)
    ring.forEach(([lat, lon]) => bounds.extend(L.latLng(lat, lon)))
  }

  for (const feature of scene.water.features) {
    L.polygon(feature.geometry.coordinates[0].map(toLatLng), {
      color: '#1e6a8f',
      weight: 0.8,
      fillColor: '#0c3550',
      fillOpacity: 0.95,
      interactive: false,
    }).addTo(instance)
  }

  for (const feature of scene.roads.features) {
    L.polyline(feature.geometry.coordinates.map(toLatLng), {
      color: 'rgba(0, 229, 255, 0.42)',
      weight: ROAD_WEIGHT[feature.properties.kind] ?? 1,
      interactive: false,
    }).addTo(instance)
  }

  for (const feature of scene.boundary.features) {
    const ring = feature.geometry.coordinates[0].map(toLatLng)
    L.polygon(ring, {
      color: '#00e5ff',
      weight: 1.4,
      fillColor: '#00e5ff',
      fillOpacity: 0.05,
      interactive: false,
    }).addTo(instance)
    ring.forEach(([lat, lon]) => bounds.extend(L.latLng(lat, lon)))
  }

  instance.fitBounds(bounds, { padding: [8, 8] })
}

function updateViewport(rect: ViewRect | null, camera?: CameraPose) {
  const instance = map.value
  if (!instance) return

  if (camera) {
    const latlng: L.LatLngTuple = [camera.lat, camera.lon]
    if (!cameraMarker) {
      cameraMarker = L.circleMarker(latlng, {
        radius: 3.5,
        color: '#00e5ff',
        weight: 1.5,
        fillColor: '#00e5ff',
        fillOpacity: 1,
        interactive: false,
      }).addTo(instance)
    } else {
      cameraMarker.setLatLng(latlng)
    }

    const reach = 0.0026
    const end: L.LatLngTuple = [
      camera.lat + Math.cos(camera.heading) * reach,
      camera.lon + (Math.sin(camera.heading) * reach) / Math.cos((camera.lat * Math.PI) / 180),
    ]
    if (!cameraLine) {
      cameraLine = L.polyline([latlng, end], {
        color: '#00e5ff',
        weight: 1.2,
        opacity: 0.75,
        interactive: false,
      }).addTo(instance)
    } else {
      cameraLine.setLatLngs([latlng, end])
    }
  }

  if (!rect) {
    viewRect?.remove()
    viewRect = null
    return
  }

  const bounds = L.latLngBounds([rect.south, rect.west], [rect.north, rect.east])
  if (!viewRect) {
    viewRect = L.rectangle(bounds, {
      color: '#00e5ff',
      weight: 1,
      dashArray: '5 4',
      fillColor: '#00e5ff',
      fillOpacity: 0.08,
      interactive: false,
    }).addTo(instance)
    return
  }
  viewRect.setBounds(bounds)
}

/** 主场景选中对象在 2D 小地图上的定位标记 */
function setFocus(
  lon: number | null,
  lat?: number,
  kind: 'alert' | 'building' | 'device' = 'building',
) {
  const instance = map.value
  if (!instance) return

  if (lon === null || lat === undefined) {
    focusMarker?.remove()
    focusRing?.remove()
    focusMarker = null
    focusRing = null
    return
  }

  const color = kind === 'alert' ? '#ff6b35' : kind === 'device' ? '#ffb547' : '#00e5ff'
  const latlng: L.LatLngTuple = [lat, lon]

  if (!focusMarker) {
    focusRing = L.circleMarker(latlng, {
      radius: 9,
      color,
      weight: 1,
      opacity: 0.55,
      fill: false,
      interactive: false,
    }).addTo(instance)
    focusMarker = L.circleMarker(latlng, {
      radius: 3.6,
      color,
      weight: 1,
      fillColor: color,
      fillOpacity: 1,
      interactive: false,
    }).addTo(instance)
    return
  }

  focusMarker.setLatLng(latlng).setStyle({ color, fillColor: color })
  focusRing?.setLatLng(latlng).setStyle({ color })
}

defineExpose({ updateViewport, setFocus })

onMounted(() => {
  if (!el.value) return
  const container = el.value
  const instance = L.map(container, {
    center: PARK_CENTER,
    zoom: 14,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false,
    keyboard: false,
    touchZoom: false,
  })
  map.value = instance

  buildLayers(instance)
  instance.invalidateSize()

  // 页面整体被 CSS transform 缩放，Leaflet 自带的事件坐标会偏移，这里自行换算容器坐标
  const onClick = (event: MouseEvent) => {
    const rect = container.getBoundingClientRect()
    const point = L.point(
      ((event.clientX - rect.left) / rect.width) * container.clientWidth,
      ((event.clientY - rect.top) / rect.height) * container.clientHeight,
    )
    const latlng = instance.containerPointToLatLng(point)
    emit('fly', latlng.lng, latlng.lat)
  }
  container.addEventListener('click', onClick)
  clickCleanup = () => container.removeEventListener('click', onClick)
})

onBeforeUnmount(() => {
  clickCleanup?.()
  clickCleanup = undefined
  map.value?.remove()
  map.value = null
  viewRect = null
})
</script>

<template>
  <div class="minimap">
    <div ref="el" class="minimap-canvas"></div>
    <span class="minimap-label">2D 视野 · 点击定位</span>
  </div>
</template>

<style scoped lang="scss">
.minimap {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 3;
  width: 260px;
  height: 170px;
  overflow: hidden;
  border: 1px solid rgba(0, 229, 255, 0.25);
  border-radius: 4px;
  background: #050b14;
  box-shadow: 0 0 18px rgba(0, 0, 0, 0.45);
}

.minimap-canvas {
  position: absolute;
  inset: 0;
  cursor: crosshair;
}

.minimap-label {
  position: absolute;
  top: 7px;
  left: 9px;
  z-index: 500;
  padding: 2px 6px;
  border-radius: 2px;
  color: var(--primary);
  font-size: 10px;
  letter-spacing: 0.06em;
  background: rgba(3, 12, 24, 0.72);
  pointer-events: none;
}

:deep(.leaflet-container) {
  background: #050b14;
  font-family: inherit;
  outline: none;
}

:deep(.leaflet-pane) {
  z-index: 1;
}

:deep(.leaflet-overlay-pane svg) {
  overflow: visible;
}
</style>
