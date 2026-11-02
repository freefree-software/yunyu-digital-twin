<script setup lang="ts">
import { computed } from 'vue'
import { DISPOSAL_STEPS, useDashboardStore } from '@/stores/dashboard'

const store = useDashboardStore()

const alert = computed(() => store.selectedAlert)

const actionLabel = computed(
  () => DISPOSAL_STEPS.find((step) => step.stage === store.disposalStage)?.action ?? '已完成',
)

const lastLog = computed(() => store.disposalLog[store.disposalLog.length - 1] ?? null)

function close() {
  if (store.selectedAlert) store.selectBuilding(store.selectedBuildingId)
}
</script>

<template>
  <transition name="timeline">
    <section v-if="alert" class="disposal">
      <header class="disposal-head">
        <span class="disposal-tag">告警处置</span>
        <span class="disposal-name">{{ alert.type }}</span>
        <span class="disposal-loc">{{ alert.buildingName }} · {{ alert.deviceName }}</span>
        <span class="disposal-time num">{{ alert.time }}</span>
        <button class="close" title="关闭处置" @click="close">×</button>
      </header>

      <ol class="steps">
        <li
          v-for="step in DISPOSAL_STEPS"
          :key="step.stage"
          class="step"
          :class="{ done: store.disposalStage > step.stage, current: store.disposalStage === step.stage }"
        >
          <span class="dot"></span>
          <span class="step-label">{{ step.label }}</span>
        </li>
      </ol>

      <footer class="disposal-foot">
        <div class="log">
          <span v-if="lastLog" class="log-time num">{{ lastLog.time }}</span>
          <span v-if="lastLog" class="log-note">{{ lastLog.note }}</span>
          <span v-if="store.route && !store.routeArrived" class="route-live">
            行进中 · {{ store.route.resourceName }} · {{ store.route.distanceKm.toFixed(2) }} km
          </span>
        </div>
        <div class="ops">
          <button
            class="ghost-btn"
            :class="{ active: store.autoDisposal }"
            @click="store.toggleAutoDisposal()"
          >
            {{ store.autoDisposal ? '暂停演示' : '自动演示' }}
          </button>
          <button
            class="primary-btn"
            :disabled="store.disposalStage >= 5"
            @click="store.advanceDisposal()"
          >
            {{ actionLabel }}
          </button>
        </div>
      </footer>
    </section>
  </transition>
</template>

<style scoped lang="scss">
.disposal {
  position: absolute;
  bottom: 16px;
  left: 52%;
  z-index: 6;
  width: 590px;
  padding: 12px 14px;
  border: 1px solid rgba(255, 107, 53, 0.32);
  border-radius: 6px;
  background: rgba(8, 16, 27, 0.92);
  box-shadow: 0 0 24px rgba(255, 107, 53, 0.12);
  transform: translateX(-50%);
  backdrop-filter: blur(10px);
}

.disposal-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.disposal-tag {
  padding: 2px 7px;
  border: 1px solid rgba(255, 107, 53, 0.45);
  border-radius: 2px;
  color: var(--alert);
  font-size: 10px;
  letter-spacing: 0.1em;
  background: rgba(255, 107, 53, 0.1);
}

.disposal-name {
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
}

.disposal-loc {
  flex: 1;
  color: var(--text-dim);
  font-size: 11px;
}

.disposal-time {
  color: var(--text-dim);
  font-size: 11px;
}

.close {
  width: 18px;
  height: 18px;
  color: var(--text-dim);
  font-size: 16px;
  line-height: 1;
}

.close:hover {
  color: var(--alert);
}

.steps {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 12px 0 10px;
  list-style: none;
}

.step {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  color: var(--text-dim);
  font-size: 10px;
}

.step::before {
  position: absolute;
  top: 4px;
  left: -50%;
  width: 100%;
  height: 1px;
  background: rgba(107, 140, 168, 0.22);
  content: '';
}

.step:first-child::before {
  display: none;
}

.step.done {
  color: var(--primary);
}

.step.current {
  color: var(--alert);
}

.dot {
  position: relative;
  z-index: 1;
  width: 9px;
  height: 9px;
  border: 1px solid rgba(107, 140, 168, 0.6);
  border-radius: 50%;
  background: #08101b;
}

.step.done .dot {
  border-color: var(--primary);
  background: var(--primary);
  box-shadow: 0 0 8px rgba(0, 229, 255, 0.5);
}

.step.current .dot {
  border-color: var(--alert);
  background: var(--alert);
  box-shadow: 0 0 10px rgba(255, 107, 53, 0.7);
  animation: pulse 1.4s infinite;
}

.step.done::before {
  background: rgba(0, 229, 255, 0.45);
}

.disposal-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(0, 229, 255, 0.1);
}

.log {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 11px;
}

.log-time {
  color: var(--primary);
}

.log-note {
  overflow: hidden;
  color: var(--text-dim);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.route-live {
  flex-shrink: 0;
  color: var(--warning);
}

.ops {
  display: flex;
  gap: 8px;
}

.ghost-btn,
.primary-btn {
  padding: 6px 12px;
  border-radius: 3px;
  font-size: 11px;
  letter-spacing: 0.06em;
}

.ghost-btn {
  border: 1px solid rgba(0, 229, 255, 0.24);
  color: var(--text-dim);
}

.ghost-btn:hover,
.ghost-btn.active {
  border-color: var(--primary);
  color: var(--primary);
}

.primary-btn {
  border: 1px solid var(--alert);
  color: var(--alert);
  background: rgba(255, 107, 53, 0.12);
}

.primary-btn:hover:not(:disabled) {
  background: rgba(255, 107, 53, 0.24);
}

.primary-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

.timeline-enter-active,
.timeline-leave-active {
  transition: opacity 200ms ease, transform 200ms ease;
}

.timeline-enter-from,
.timeline-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}
</style>
