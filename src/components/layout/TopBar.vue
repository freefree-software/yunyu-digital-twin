<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import SearchBox from '@/components/layout/SearchBox.vue'
import type { DashboardMode } from '@/types/domain'

const store = useDashboardStore()

const modes: Array<{ key: DashboardMode; label: string }> = [
  { key: 'overview', label: '总览' },
  { key: 'disposal', label: '处置' },
  { key: 'tour', label: '漫游' },
]

const now = ref(new Date())
let timer: number | undefined

const dateText = computed(() =>
  new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).format(now.value),
)

const timeText = computed(() => now.value.toLocaleTimeString('zh-CN', { hour12: false }))

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = new Date()
  }, 1000)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
})
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark"></span>
      <div class="brand-text">
        <h1>云屿园区数字孪生运营平台</h1>
        <p>YUNYU PARK DIGITAL TWIN</p>
      </div>
    </div>

    <nav class="modes">
      <button
        v-for="mode in modes"
        :key="mode.key"
        class="mode"
        :class="{ active: store.activeMode === mode.key }"
        @click="store.setMode(mode.key)"
      >
        {{ mode.label }}
      </button>
    </nav>

    <SearchBox class="topbar-search" />

    <div class="meta">
      <div class="datetime">
        <span class="date">{{ dateText }}</span>
        <span class="time num">{{ timeText }}</span>
      </div>
      <span class="weather">晴 18℃</span>
      <button
        class="realtime"
        :class="store.realtime.status"
        :title="`${store.realtime.lastEvent} · 点击模拟断线重连`"
        @click="store.simulateRealtimeDrop()"
      >
        <i></i>
        <span>{{ store.realtime.status === 'connected' ? '实时链路' : '重连中' }}</span>
        <b class="num">{{ store.realtime.pushes }}</b>
      </button>
      <span class="alert-pill">
        <i></i>
        未处置 <strong class="num">{{ store.pendingAlertCount }}</strong>
      </span>
    </div>
  </header>
</template>

<style scoped lang="scss">
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 22px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    rgba(0, 229, 255, 0.12) 0%,
    rgba(10, 25, 47, 0.78) 28%,
    rgba(10, 25, 47, 0.78) 72%,
    rgba(0, 229, 255, 0.12) 100%
  );
  box-shadow: var(--shadow-panel);
}

.brand {
  display: flex;
  align-items: center;
  gap: 14px;
}

.brand-mark {
  width: 12px;
  height: 24px;
  background: linear-gradient(180deg, var(--primary), rgba(0, 229, 255, 0.2));
  box-shadow: 0 0 12px var(--primary);
  clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
}

.brand-text h1 {
  color: var(--text);
  font-size: 19px;
  font-weight: 600;
  letter-spacing: 0.12em;
}

.brand-text p {
  margin-top: 3px;
  color: var(--text-dim);
  font-family: var(--font-number);
  font-size: 10px;
  letter-spacing: 0.22em;
}

.modes {
  display: flex;
  gap: 4px;
  padding: 4px;
  border: 1px solid rgba(0, 229, 255, 0.18);
  border-radius: 4px;
  background: rgba(3, 12, 24, 0.6);
}

.mode {
  min-width: 74px;
  padding: 7px 14px;
  border-radius: 3px;
  color: var(--text-dim);
  font-size: 13px;
  letter-spacing: 0.1em;
  transition: color 160ms ease, background 160ms ease;
}

.mode:hover {
  color: var(--text);
}

.mode.active {
  color: var(--bg-deep);
  background: var(--primary);
  box-shadow: 0 0 14px rgba(0, 229, 255, 0.45);
  font-weight: 600;
}

.meta {
  display: flex;
  align-items: center;
  gap: 22px;
}

.datetime {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.date {
  color: var(--text-dim);
  font-size: 11px;
  letter-spacing: 0.08em;
}

.time {
  color: var(--text);
  font-size: 18px;
}

.weather {
  padding-left: 18px;
  border-left: 1px solid rgba(0, 229, 255, 0.2);
  color: var(--text-dim);
  font-size: 12px;
}

.topbar-search {
  margin-left: auto;
  margin-right: 24px;
}

.realtime {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  border: 1px solid rgba(24, 229, 160, 0.4);
  border-radius: 3px;
  color: var(--success);
  font-size: 11px;
  background: rgba(24, 229, 160, 0.07);
}

.realtime i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
  box-shadow: 0 0 8px var(--success);
  animation: pulse 1.6s infinite;
}

.realtime b {
  color: var(--text);
  font-size: 11px;
}

.realtime.reconnecting {
  border-color: rgba(255, 181, 71, 0.45);
  color: var(--warning);
  background: rgba(255, 181, 71, 0.08);
}

.realtime.reconnecting i {
  background: var(--warning);
  box-shadow: 0 0 8px var(--warning);
}

.alert-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border: 1px solid rgba(255, 107, 53, 0.45);
  border-radius: 3px;
  color: var(--alert);
  font-size: 12px;
  background: rgba(255, 107, 53, 0.08);
}

.alert-pill i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--alert);
  box-shadow: 0 0 8px var(--alert);
  animation: pulse 1.5s infinite;
}

.alert-pill strong {
  font-size: 15px;
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
</style>
