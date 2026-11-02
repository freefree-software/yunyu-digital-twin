<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import type { LayerKey } from '@/types/domain'

const store = useDashboardStore()

const layerItems: Array<{ key: LayerKey; label: string }> = [
  { key: 'imagery', label: '影像底图' },
  { key: 'buildings', label: '建筑白模' },
  { key: 'surroundings', label: '周边楼宇' },
  { key: 'devices', label: '设备点位' },
  { key: 'alerts', label: '告警点位' },
  { key: 'poi', label: '园区 POI' },
]

const summaryRows = computed(() => {
  const total = store.deviceTotal || 1
  return [
    { label: '正常', value: store.deviceSummary.normal, color: 'var(--success)' },
    { label: '预警', value: store.deviceSummary.warning, color: 'var(--warning)' },
    { label: '离线', value: store.deviceSummary.offline, color: 'var(--alert)' },
  ].map((row) => ({
    ...row,
    percent: `${Math.round((row.value / total) * 100)}%`,
  }))
})
</script>

<template>
  <aside class="left-column">
    <section class="panel overview">
      <div class="panel-title">园区概览</div>
      <div class="stat-grid">
        <div class="stat">
          <span class="stat-label">建筑</span>
          <div class="stat-value">
            <strong class="num">{{ store.stats.buildingCount }}</strong>
            <span class="unit">栋</span>
          </div>
        </div>
        <div class="stat">
          <span class="stat-label">设备</span>
          <div class="stat-value">
            <strong class="num">{{ store.stats.deviceCount }}</strong>
            <span class="unit">台</span>
          </div>
        </div>
        <div class="stat">
          <span class="stat-label">在线率</span>
          <div class="stat-value">
            <strong class="num">{{ store.stats.onlineRate.toFixed(1) }}</strong>
            <span class="unit">%</span>
          </div>
        </div>
        <div class="stat">
          <span class="stat-label">未处置</span>
          <div class="stat-value alert">
            <strong class="num">{{ store.pendingAlertCount }}</strong>
            <span class="unit">条</span>
          </div>
        </div>
      </div>
    </section>

    <section class="panel layers">
      <div class="panel-title">图层管理</div>
      <ul class="layer-list">
        <li v-for="layer in layerItems" :key="layer.key">
          <label class="layer-item">
            <input
              type="checkbox"
              :checked="store.layers[layer.key]"
              @change="store.toggleLayer(layer.key)"
            />
            <span class="checkbox"></span>
            <span class="layer-label">{{ layer.label }}</span>
            <span class="layer-state">{{ store.layers[layer.key] ? 'ON' : 'OFF' }}</span>
          </label>
        </li>
      </ul>
    </section>

    <section class="panel devices">
      <div class="panel-title">设备状态</div>
      <div class="device-total">
        <strong class="num">{{ store.onlineDevices }}</strong>
        <span>/ {{ store.deviceTotal }} 台在线</span>
      </div>
      <ul class="summary-list">
        <li v-for="row in summaryRows" :key="row.label" class="summary-item">
          <div class="summary-head">
            <span class="summary-label">
              <i :style="{ background: row.color }"></i>
              {{ row.label }}
            </span>
            <span class="num">{{ row.value }}</span>
          </div>
          <div class="bar">
            <span :style="{ width: row.percent, background: row.color }"></span>
          </div>
        </li>
      </ul>
    </section>
  </aside>
</template>

<style scoped lang="scss">
.left-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.panel {
  padding: 16px;
}

.overview {
  flex-shrink: 0;
}

.stat-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-top: 14px;
}

.stat {
  padding: 10px 12px;
  border: 1px solid rgba(0, 229, 255, 0.12);
  border-radius: 4px;
  background: rgba(0, 229, 255, 0.04);
}

.stat-label {
  color: var(--text-dim);
  font-size: 11px;
  letter-spacing: 0.08em;
}

.stat-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin-top: 4px;
}

.stat-value strong {
  color: var(--primary);
  font-size: 26px;
  font-weight: 600;
  line-height: 1;
  text-shadow: 0 0 12px rgba(0, 229, 255, 0.35);
}

.stat-value.alert strong {
  color: var(--alert);
  text-shadow: 0 0 12px rgba(255, 107, 53, 0.35);
}

.unit {
  color: var(--text-dim);
  font-size: 11px;
}

.layers {
  flex-shrink: 0;
}

.layer-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 10px;
  list-style: none;
}

.layer-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 6px;
  border-radius: 3px;
  cursor: pointer;
  transition: background 160ms ease;
}

.layer-item:hover {
  background: rgba(0, 229, 255, 0.06);
}

.layer-item input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.checkbox {
  position: relative;
  width: 15px;
  height: 15px;
  border: 1px solid rgba(0, 229, 255, 0.45);
  border-radius: 2px;
  background: rgba(0, 229, 255, 0.04);
}

.layer-item input:checked + .checkbox {
  border-color: var(--primary);
  background: var(--primary);
  box-shadow: 0 0 8px rgba(0, 229, 255, 0.4);
}

.layer-item input:checked + .checkbox::after {
  position: absolute;
  top: 1px;
  left: 4px;
  width: 4px;
  height: 8px;
  border-right: 2px solid var(--bg-deep);
  border-bottom: 2px solid var(--bg-deep);
  transform: rotate(42deg);
  content: '';
}

.layer-label {
  flex: 1;
  color: var(--text);
  font-size: 13px;
}

.layer-state {
  color: var(--text-dim);
  font-family: var(--font-number);
  font-size: 10px;
  letter-spacing: 0.1em;
}

.devices {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.device-total {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 12px 0 14px;
  color: var(--text-dim);
  font-size: 11px;
}

.device-total strong {
  color: var(--success);
  font-size: 28px;
  font-weight: 600;
  line-height: 1;
}

.summary-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
  list-style: none;
}

.summary-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--text-dim);
  font-size: 12px;
}

.summary-label {
  display: flex;
  align-items: center;
  gap: 7px;
}

.summary-label i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.summary-head .num {
  color: var(--text);
}

.bar {
  height: 4px;
  margin-top: 6px;
  overflow: hidden;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.06);
}

.bar span {
  display: block;
  height: 100%;
  border-radius: 2px;
  transition: width 400ms ease;
}
</style>
