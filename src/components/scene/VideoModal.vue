<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'

const store = useDashboardStore()
const now = ref(new Date())
let timer: number | undefined

const timestamp = computed(() =>
  now.value.toLocaleString('zh-CN', { hour12: false }),
)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') store.closeCamera()
}

onMounted(() => {
  timer = window.setInterval(() => {
    now.value = new Date()
  }, 1000)
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <section v-if="store.selectedCamera" class="video">
    <header class="video-head">
      <span class="live"><i></i>LIVE</span>
      <span class="video-name">{{ store.selectedCamera.name }}</span>
      <button class="close" title="关闭" @click="store.closeCamera()">×</button>
    </header>

    <div class="feed" :class="{ offline: !store.selectedCamera.online }">
      <template v-if="store.selectedCamera.online">
        <div class="feed-grid"></div>
        <div class="feed-sweep"></div>
        <span class="corner tl"></span>
        <span class="corner tr"></span>
        <span class="corner bl"></span>
        <span class="corner br"></span>
        <span class="target t1"></span>
        <span class="target t2"></span>
        <div class="feed-info">
          <span>{{ store.selectedCamera.buildingName }}</span>
          <span class="num">{{ timestamp }}</span>
        </div>
        <div class="feed-meta">
          <span>{{ store.selectedCamera.resolution }} · 25 FPS</span>
          <span>H.265 · 4 Mbps</span>
        </div>
      </template>
      <div v-else class="no-signal">
        <span class="signal-icon"></span>
        <b>信号中断</b>
        <em>设备离线，请检查链路</em>
      </div>
    </div>

    <footer class="video-foot">
      <span>模拟视频信号 · 演示数据</span>
      <span class="cam-id num">{{ store.selectedCamera.id }}</span>
    </footer>
  </section>
</template>

<style scoped lang="scss">
.video {
  position: absolute;
  top: 16px;
  left: 50%;
  z-index: 8;
  width: 420px;
  overflow: hidden;
  border: 1px solid rgba(0, 229, 255, 0.35);
  border-radius: 6px;
  background: rgba(4, 11, 20, 0.95);
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.5), 0 0 24px rgba(0, 229, 255, 0.12);
  transform: translateX(-50%);
}

.video-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(0, 229, 255, 0.14);
}

.live {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--alert);
  font-size: 9px;
  letter-spacing: 0.12em;
}

.live i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--alert);
  animation: pulse 1.2s infinite;
}

.video-name {
  color: var(--text);
  font-size: 12px;
}

.close {
  margin-left: auto;
  width: 18px;
  height: 18px;
  color: var(--text-dim);
  font-size: 16px;
}

.close:hover {
  color: var(--primary);
}

.feed {
  position: relative;
  height: 236px;
  overflow: hidden;
  background:
    radial-gradient(circle at 30% 40%, rgba(0, 229, 255, 0.16), transparent 55%),
    radial-gradient(circle at 75% 60%, rgba(0, 229, 255, 0.1), transparent 50%),
    linear-gradient(160deg, #071621 0%, #0a2231 55%, #061019 100%);
}

.feed-grid {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(0, 229, 255, 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0, 229, 255, 0.08) 1px, transparent 1px);
  background-size: 34px 34px;
  transform: perspective(300px) rotateX(46deg) scale(1.6);
  opacity: 0.55;
  animation: drift 8s linear infinite;
}

@keyframes drift {
  from {
    background-position: 0 0;
  }
  to {
    background-position: 0 68px;
  }
}

.feed-sweep {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    transparent 0%,
    rgba(0, 229, 255, 0.14) 48%,
    rgba(0, 229, 255, 0.3) 50%,
    transparent 52%
  );
  background-size: 100% 28px;
  background-repeat: no-repeat;
  opacity: 0.45;
  animation: sweep 4.2s linear infinite;
}

@keyframes sweep {
  from {
    background-position: 0 -40px;
  }
  to {
    background-position: 0 280px;
  }
}

.corner {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 1px solid rgba(0, 229, 255, 0.7);
}

.corner.tl {
  top: 14px;
  left: 14px;
  border-right: 0;
  border-bottom: 0;
}

.corner.tr {
  top: 14px;
  right: 14px;
  border-left: 0;
  border-bottom: 0;
}

.corner.bl {
  bottom: 34px;
  left: 14px;
  border-right: 0;
  border-top: 0;
}

.corner.br {
  right: 14px;
  bottom: 34px;
  border-left: 0;
  border-top: 0;
}

.target {
  position: absolute;
  border: 1px solid rgba(255, 181, 71, 0.75);
  border-radius: 2px;
  animation: target 3.4s ease-in-out infinite alternate;
}

.target::after {
  content: '';
  position: absolute;
  top: -3px;
  left: -3px;
  width: 4px;
  height: 4px;
  border: 1px solid var(--warning);
}

.target.t1 {
  top: 52px;
  left: 88px;
  width: 76px;
  height: 54px;
}

.target.t2 {
  right: 70px;
  bottom: 64px;
  width: 54px;
  height: 40px;
  animation-delay: 1.2s;
}

@keyframes target {
  from {
    transform: translate(0, 0);
  }
  to {
    transform: translate(8px, -5px);
  }
}

.feed-info {
  position: absolute;
  top: 12px;
  left: 22px;
  display: flex;
  flex-direction: column;
  color: rgba(215, 231, 247, 0.85);
  font-size: 10px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.feed-meta {
  position: absolute;
  right: 18px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  color: rgba(215, 231, 247, 0.65);
  font-size: 9px;
}

.no-signal {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-dim);
  background: repeating-linear-gradient(
    0deg,
    rgba(255, 107, 53, 0.05) 0px,
    rgba(255, 107, 53, 0.05) 2px,
    transparent 2px,
    transparent 6px
  );
}

.no-signal b {
  color: var(--alert);
  font-size: 13px;
  letter-spacing: 0.08em;
}

.no-signal em {
  font-style: normal;
  font-size: 10px;
}

.signal-icon {
  width: 26px;
  height: 26px;
  border: 1px solid var(--alert);
  border-radius: 50%;
  opacity: 0.7;
}

.video-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 12px;
  border-top: 1px solid rgba(0, 229, 255, 0.12);
  color: var(--text-dim);
  font-size: 9px;
}

.cam-id {
  color: var(--primary);
}
</style>
