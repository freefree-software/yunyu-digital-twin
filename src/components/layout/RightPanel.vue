<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import TrendChart from '@/components/charts/TrendChart.vue'
import type { AlertStatus } from '@/types/domain'

const store = useDashboardStore()

const statusText: Record<AlertStatus, string> = {
  pending: '待处置',
  processing: '处置中',
  resolved: '已完成',
}

const resourceLabels = {
  fire: '消防',
  medical: '医疗',
  team: '应急',
} as const

const filterLabel = computed(() =>
  store.trendHour === null ? null : `${String(store.trendHour).padStart(2, '0')}:00 告警`,
)

const activeResourceId = computed(() => store.route?.resourceId ?? null)

function pickResource(id: string) {
  if (!store.selectedAlert) return
  store.planRoute(id)
}
</script>

<template>
  <aside class="right-column">
    <section class="panel alerts">
      <div class="panel-head">
        <div class="panel-title">实时告警</div>
        <span class="count num">{{ store.pendingAlertCount }}</span>
      </div>

      <div v-if="filterLabel" class="filter-chip">
        <span>筛选 · {{ filterLabel }} {{ store.filteredAlerts.length }} 条</span>
        <button @click="store.setTrendHour(store.trendHour ?? 0)">清除</button>
      </div>

      <ul class="alert-list">
        <li
          v-for="alert in store.filteredAlerts"
          :key="alert.id"
          class="alert-item"
          :class="[`level-${alert.level}`, alert.status, { active: alert.id === store.selectedAlertId }]"
          @click="store.focusAlert(alert.id)"
        >
          <div class="alert-top">
            <span class="time num">{{ alert.time }}</span>
            <span v-if="alert.pushed" class="new-tag">NEW</span>
            <span class="status" :class="alert.status">{{ statusText[alert.status] }}</span>
          </div>
          <div class="alert-name">{{ alert.type }}</div>
          <div class="alert-meta">{{ alert.buildingName }} · {{ alert.deviceName }}</div>
          <span class="locate">点击定位</span>
        </li>
      </ul>
    </section>

    <section class="panel resources">
      <div class="panel-head">
        <div class="panel-title">处置资源</div>
        <span class="hint">{{ store.selectedAlert ? '点击规划路径' : '先选择告警' }}</span>
      </div>
      <ul class="resource-list">
        <li
          v-for="resource in store.resources"
          :key="resource.id"
          class="resource-item"
          :class="{ active: resource.id === activeResourceId, disabled: !store.selectedAlert }"
          @click="pickResource(resource.id)"
        >
          <span class="resource-type">{{ resourceLabels[resource.type] }}</span>
          <span class="resource-name">{{ resource.name }}</span>
          <span class="resource-distance num">{{ resource.distance.toFixed(1) }} km</span>
        </li>
      </ul>
    </section>

    <section class="panel trend">
      <div class="panel-title">告警趋势</div>
      <div class="trend-body">
        <TrendChart
          :times="store.trend.times"
          :values="store.trend.values"
          :active-index="store.trendHour === null ? null : store.trend.times.indexOf(`${String(store.trendHour).padStart(2, '0')}:00`)"
          @pick="store.setTrendHour(Number(store.trend.times[$event].slice(0, 2)))"
        />
        <div class="bins">
          <button
            v-for="(label, index) in store.trend.times"
            :key="label"
            class="bin"
            :class="{ active: store.trendHour === Number(label.slice(0, 2)) }"
            :title="`${label} · 告警 ${store.trend.values[index]} 条`"
            @click="store.setTrendHour(Number(label.slice(0, 2)))"
          ></button>
        </div>
      </div>
    </section>
  </aside>
</template>

<style scoped lang="scss">
.right-column {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.panel {
  padding: 16px;
}

.alerts {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.count {
  min-width: 24px;
  padding: 3px 7px;
  border: 1px solid rgba(255, 107, 53, 0.4);
  border-radius: 3px;
  color: var(--alert);
  font-size: 12px;
  text-align: center;
  background: rgba(255, 107, 53, 0.08);
}

.hint {
  color: var(--text-dim);
  font-size: 10px;
}

.filter-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding: 6px 9px;
  border: 1px solid rgba(0, 229, 255, 0.3);
  border-radius: 3px;
  color: var(--primary);
  font-size: 11px;
  background: rgba(0, 229, 255, 0.08);
}

.filter-chip button {
  color: var(--text-dim);
  font-size: 10px;
}

.filter-chip button:hover {
  color: var(--primary);
}

.alert-list {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  overflow-y: auto;
  list-style: none;
}

.alert-item {
  position: relative;
  padding: 10px 12px;
  border: 1px solid rgba(0, 229, 255, 0.1);
  border-left: 2px solid var(--text-dim);
  border-radius: 3px;
  background: rgba(0, 229, 255, 0.03);
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease;
}

.alert-item:hover {
  border-color: rgba(0, 229, 255, 0.35);
  background: rgba(0, 229, 255, 0.07);
}

.alert-item.active {
  border-color: var(--alert);
  background: rgba(255, 107, 53, 0.1);
  box-shadow: 0 0 12px rgba(255, 107, 53, 0.16);
}

.alert-item.level-high {
  border-left-color: var(--alert);
  background: rgba(255, 107, 53, 0.06);
}

.alert-item.level-medium {
  border-left-color: var(--warning);
}

.alert-item.level-low {
  border-left-color: var(--primary);
}

.alert-item.resolved {
  opacity: 0.5;
}

.alert-top {
  display: flex;
  align-items: center;
  gap: 6px;
  justify-content: space-between;
}

.time {
  margin-right: auto;
  color: var(--text-dim);
  font-size: 11px;
}

.new-tag {
  padding: 1px 4px;
  border-radius: 2px;
  color: #fff;
  font-size: 8px;
  letter-spacing: 0.08em;
  background: var(--alert);
}

.status {
  padding: 2px 6px;
  border-radius: 2px;
  color: var(--text-dim);
  font-size: 10px;
  background: rgba(107, 140, 168, 0.12);
}

.status.pending {
  color: var(--alert);
  background: rgba(255, 107, 53, 0.12);
}

.status.processing {
  color: var(--warning);
  background: rgba(255, 181, 71, 0.12);
}

.status.resolved {
  color: var(--success);
  background: rgba(24, 229, 160, 0.1);
}

.alert-name {
  margin-top: 6px;
  color: var(--text);
  font-size: 13px;
  font-weight: 500;
}

.alert-meta {
  margin-top: 4px;
  color: var(--text-dim);
  font-size: 11px;
}

.locate {
  position: absolute;
  right: 10px;
  bottom: 9px;
  color: var(--primary);
  font-size: 10px;
  opacity: 0;
  transition: opacity 160ms ease;
}

.alert-item:hover .locate {
  opacity: 1;
}

.resources {
  flex-shrink: 0;
}

.resource-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
  list-style: none;
}

.resource-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(0, 229, 255, 0.1);
  border-radius: 3px;
  background: rgba(0, 229, 255, 0.03);
  cursor: pointer;
  transition: border-color 160ms ease, background 160ms ease;
}

.resource-item:hover:not(.disabled) {
  border-color: rgba(0, 229, 255, 0.4);
  background: rgba(0, 229, 255, 0.08);
}

.resource-item.active {
  border-color: var(--primary);
  background: rgba(0, 229, 255, 0.14);
}

.resource-item.disabled {
  opacity: 0.45;
  cursor: default;
}

.resource-type {
  padding: 2px 6px;
  border: 1px solid rgba(0, 229, 255, 0.3);
  border-radius: 2px;
  color: var(--primary);
  font-size: 10px;
}

.resource-name {
  flex: 1;
  color: var(--text);
  font-size: 12px;
}

.resource-distance {
  color: var(--text-dim);
  font-size: 11px;
}

.trend {
  flex-shrink: 0;
  height: 218px;
}

.trend-body {
  position: relative;
  height: 158px;
  margin-top: 8px;
}

.trend-body :deep(.chart) {
  width: 100%;
  height: 100%;
}

.bins {
  position: absolute;
  inset: 0;
  display: flex;
}

.bin {
  flex: 1;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.bin:hover {
  background: rgba(0, 229, 255, 0.06);
}

.bin.active {
  background: rgba(0, 229, 255, 0.12);
  box-shadow: inset 0 0 0 1px rgba(0, 229, 255, 0.28);
}
</style>
