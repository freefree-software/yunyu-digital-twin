<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import DeviceChart from '@/components/charts/DeviceChart.vue'
import type { BuildingKind, DeviceStatus } from '@/types/domain'

const store = useDashboardStore()

const kindLabels: Record<BuildingKind, string> = {
  office: '研发办公',
  lab: '实验楼',
  factory: '生产厂房',
  warehouse: '仓储',
  commercial: '商业配套',
  residential: '宿舍',
  utility: '动力配套',
  public: '公共服务',
}

const statusLabels: Record<DeviceStatus, string> = {
  normal: '正常',
  warning: '预警',
  offline: '离线',
}

const buildingStatus = computed(() => {
  const list = store.buildingDevices
  return {
    normal: list.filter((item) => item.status === 'normal').length,
    warning: list.filter((item) => item.status === 'warning').length,
    offline: list.filter((item) => item.status === 'offline').length,
  }
})

const relatedAlert = computed(() => {
  if (!store.selectedBuildingId) return null
  return (
    store.alerts.find(
      (item) => item.buildingId === store.selectedBuildingId && item.status !== 'resolved',
    ) ?? null
  )
})

const device = computed(() => store.selectedDevice)
const building = computed(() => store.selectedBuilding)
</script>

<template>
  <transition name="card">
    <section v-if="store.infoKind" class="info-card">
      <header class="card-head">
        <span class="card-tag">{{ device ? '设备详情' : '建筑详情' }}</span>
        <button class="close" title="关闭" @click="store.clearInfo()">×</button>
      </header>

      <template v-if="device">
        <h3 class="card-title">{{ device.name }}</h3>
        <p class="card-sub">
          {{ device.type }} · {{ device.buildingName }} {{ device.floor }}F
        </p>
        <div class="status-row">
          <span class="status-dot" :class="device.status"></span>
          <span class="status-text">{{ statusLabels[device.status] }}</span>
          <span class="metric"><b class="num">{{ device.temperature.toFixed(1) }}</b> ℃</span>
          <span class="metric"><b class="num">{{ device.current.toFixed(2) }}</b> A</span>
        </div>
        <div class="chart-caption">温度 / 电流 实时曲线</div>
        <DeviceChart :device="device" />
      </template>

      <template v-else-if="building">
        <h3 class="card-title">{{ building.name }}</h3>
        <p class="card-sub">
          {{ building.district }} · {{ kindLabels[building.kind] }}
          <em v-if="building.keyBuilding" class="key">重点楼宇</em>
        </p>
        <div class="grid">
          <div class="cell">
            <span class="cell-label">楼层</span>
            <b class="num">{{ building.floors }}</b>
          </div>
          <div class="cell">
            <span class="cell-label">建筑面积</span>
            <b class="num">{{ building.area.toLocaleString() }}</b>
          </div>
          <div class="cell">
            <span class="cell-label">设备</span>
            <b class="num">{{ store.buildingDevices.length }}</b>
          </div>
          <div class="cell">
            <span class="cell-label">未处置告警</span>
            <b class="num alert">{{ building.alertCount }}</b>
          </div>
        </div>
        <div class="device-bar">
          <span class="bar normal" :style="{ flex: buildingStatus.normal || 0.01 }"></span>
          <span class="bar warning" :style="{ flex: buildingStatus.warning || 0.01 }"></span>
          <span class="bar offline" :style="{ flex: buildingStatus.offline || 0.01 }"></span>
        </div>
        <div class="bar-legend">
          <span><i class="normal"></i>正常 {{ buildingStatus.normal }}</span>
          <span><i class="warning"></i>预警 {{ buildingStatus.warning }}</span>
          <span><i class="offline"></i>离线 {{ buildingStatus.offline }}</span>
        </div>
        <div v-if="store.buildingDevices.length" class="mini-devices">
          <button
            v-for="item in store.buildingDevices.slice(0, 4)"
            :key="item.id"
            class="mini-device"
            :class="item.status"
            :title="`查看 ${item.name}`"
            @click="store.selectDevice(item.id)"
          >
            <i></i>{{ item.name }}
          </button>
        </div>
        <button
          class="floor-toggle"
          :class="{ active: store.floorExpanded }"
          @click="store.toggleFloor()"
        >
          {{ store.floorExpanded ? '收起楼层' : '楼层抽离' }}
          <span>{{ Math.min(building.floors, 12) }} 层拆解</span>
        </button>
      </template>

      <div v-if="relatedAlert" class="alert-strip">
        <span class="pulse-dot"></span>
        <span>{{ relatedAlert.type }} · {{ relatedAlert.deviceName }}</span>
        <b class="num">{{ relatedAlert.time }}</b>
      </div>
    </section>
  </transition>
</template>

<style scoped lang="scss">
.info-card {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 5;
  width: 302px;
  padding: 14px 16px 16px;
  border: 1px solid rgba(0, 229, 255, 0.3);
  border-radius: 6px;
  background: rgba(6, 17, 31, 0.9);
  box-shadow: 0 0 26px rgba(0, 229, 255, 0.14);
  backdrop-filter: blur(10px);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-tag {
  padding: 2px 7px;
  border: 1px solid rgba(0, 229, 255, 0.35);
  border-radius: 2px;
  color: var(--primary);
  font-size: 10px;
  letter-spacing: 0.1em;
}

.close {
  width: 18px;
  height: 18px;
  color: var(--text-dim);
  font-size: 16px;
  line-height: 1;
}

.close:hover {
  color: var(--primary);
}

.card-title {
  margin-top: 8px;
  color: var(--text);
  font-size: 18px;
  font-weight: 600;
  letter-spacing: 0.06em;
}

.card-sub {
  margin-top: 4px;
  color: var(--text-dim);
  font-size: 11px;
}

.key {
  margin-left: 6px;
  padding: 1px 4px;
  border-radius: 2px;
  color: var(--warning);
  font-style: normal;
  font-size: 9px;
  background: rgba(255, 181, 71, 0.12);
}

.status-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding: 8px 10px;
  border: 1px solid rgba(0, 229, 255, 0.1);
  border-radius: 4px;
  background: rgba(0, 229, 255, 0.04);
  font-size: 11px;
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.status-dot.normal {
  background: var(--success);
  box-shadow: 0 0 8px var(--success);
}

.status-dot.warning {
  background: var(--warning);
  box-shadow: 0 0 8px var(--warning);
}

.status-dot.offline {
  background: var(--alert);
  box-shadow: 0 0 8px var(--alert);
}

.status-text {
  color: var(--text);
}

.metric {
  color: var(--text-dim);
}

.metric b {
  color: var(--primary);
  font-size: 14px;
  font-weight: 600;
}

.chart-caption {
  margin-top: 12px;
  color: var(--text-dim);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  margin-top: 12px;
}

.cell {
  padding: 8px 10px;
  border: 1px solid rgba(0, 229, 255, 0.1);
  border-radius: 4px;
  background: rgba(0, 229, 255, 0.03);
}

.cell-label {
  display: block;
  color: var(--text-dim);
  font-size: 10px;
}

.cell b {
  display: block;
  margin-top: 4px;
  color: var(--text);
  font-size: 16px;
  font-weight: 600;
}

.cell b.alert {
  color: var(--alert);
}

.device-bar {
  display: flex;
  gap: 2px;
  height: 5px;
  margin-top: 14px;
  overflow: hidden;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.05);
}

.bar {
  display: block;
  height: 100%;
}

.bar.normal,
.bar-legend i.normal {
  background: var(--success);
}

.bar.warning,
.bar-legend i.warning {
  background: var(--warning);
}

.bar.offline,
.bar-legend i.offline {
  background: var(--alert);
}

.bar-legend {
  display: flex;
  gap: 14px;
  margin-top: 8px;
  color: var(--text-dim);
  font-size: 10px;
}

.bar-legend i {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 4px;
  border-radius: 50%;
}

.mini-devices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}

.mini-device {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  border: 1px solid rgba(0, 229, 255, 0.16);
  border-radius: 3px;
  color: var(--text-dim);
  font-size: 10px;
  background: rgba(0, 229, 255, 0.04);
}

.mini-device:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.mini-device i {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--success);
}

.mini-device.warning i {
  background: var(--warning);
}

.mini-device.offline i {
  background: var(--alert);
}

.floor-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin-top: 10px;
  padding: 7px 9px;
  border: 1px dashed rgba(0, 229, 255, 0.28);
  border-radius: 3px;
  color: var(--text-dim);
  font-size: 11px;
  letter-spacing: 0.04em;
}

.floor-toggle:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.floor-toggle.active {
  border-style: solid;
  border-color: var(--primary);
  color: var(--primary);
  background: rgba(0, 229, 255, 0.1);
}

.floor-toggle span {
  color: var(--text-dim);
  font-size: 9px;
  opacity: 0.8;
}

.alert-strip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding: 8px 10px;
  border: 1px solid rgba(255, 107, 53, 0.32);
  border-radius: 4px;
  color: var(--alert);
  font-size: 11px;
  background: rgba(255, 107, 53, 0.08);
}

.alert-strip b {
  margin-left: auto;
  font-size: 11px;
}

.pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--alert);
  box-shadow: 0 0 8px var(--alert);
  animation: blink 1.2s infinite;
}

@keyframes blink {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.3;
  }
}

.card-enter-active,
.card-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.card-enter-from,
.card-leave-to {
  opacity: 0;
  transform: translateX(10px);
}
</style>
