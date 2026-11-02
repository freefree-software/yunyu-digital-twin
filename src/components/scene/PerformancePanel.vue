<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import type { QualityLevel } from '@/types/domain'

const store = useDashboardStore()

const levels: Array<{ key: QualityLevel; label: string }> = [
  { key: 'high', label: '高清' },
  { key: 'balanced', label: '均衡' },
  { key: 'power', label: '省电' },
]

const scaleText = computed(() => {
  const scale = store.quality === 'high' ? 1 : store.quality === 'balanced' ? 0.9 : 0.75
  return `${scale.toFixed(2)}x`
})

const fpsClass = computed(() => {
  if (store.metrics.fps >= 50) return 'good'
  if (store.metrics.fps >= 30) return 'mid'
  return 'bad'
})

const triangleText = computed(() =>
  store.metrics.triangles >= 10000
    ? `${(store.metrics.triangles / 10000).toFixed(1)} 万`
    : `${store.metrics.triangles}`,
)

const delta = computed(() => {
  if (!store.baselineFps) return null
  return store.metrics.fps - store.baselineFps
})

const effectItems = [
  { key: 'boundaryFlow', label: '边界流光' },
  { key: 'scan', label: '扫描环' },
  { key: 'heatmap', label: '告警热力' },
] as const
</script>

<template>
  <section class="perf">
    <header class="perf-head">
      <span class="perf-tag">性能</span>
      <span class="perf-title">渲染监视</span>
      <button class="close" title="关闭" @click="store.togglePerf()">×</button>
    </header>

    <div class="fps">
      <b class="num" :class="fpsClass">{{ store.metrics.fps }}</b>
      <div class="fps-meta">
        <span>FPS</span>
        <em>1080p 目标 ≥ 50</em>
      </div>
    </div>

    <dl class="metrics">
      <div>
        <dt>Draw Call</dt>
        <dd class="num">{{ store.metrics.drawCalls }}</dd>
      </div>
      <div>
        <dt>图元数</dt>
        <dd class="num">{{ triangleText }}</dd>
      </div>
      <div>
        <dt>JS 堆内存</dt>
        <dd class="num">{{ store.metrics.heapMB ? `${store.metrics.heapMB} MB` : '—' }}</dd>
      </div>
      <div>
        <dt>渲染缩放</dt>
        <dd class="num">{{ scaleText }}</dd>
      </div>
    </dl>

    <div class="block">
      <span class="block-label">画质档位</span>
      <div class="seg">
        <button
          v-for="item in levels"
          :key="item.key"
          :class="{ active: store.quality === item.key }"
          @click="store.setQuality(item.key)"
        >
          {{ item.label }}
        </button>
      </div>
      <p class="tip">省电档会关闭周边楼宇、降低分辨率与 MSAA</p>
    </div>

    <div class="block">
      <span class="block-label">场景特效</span>
      <button
        v-for="item in effectItems"
        :key="item.key"
        class="effect-row"
        :class="{ on: store.effects[item.key] }"
        @click="store.toggleEffect(item.key)"
      >
        <i></i>
        {{ item.label }}
        <span class="switch">{{ store.effects[item.key] ? 'ON' : 'OFF' }}</span>
      </button>
    </div>

    <footer class="perf-foot">
      <button class="baseline" @click="store.recordBaseline()">记录基线</button>
      <span v-if="delta !== null" class="delta" :class="{ down: delta < 0 }">
        {{ delta >= 0 ? '+' : '' }}{{ delta }} FPS
      </span>
      <span v-else class="tip">切换档位后对比</span>
    </footer>
  </section>
</template>

<style scoped lang="scss">
.perf {
  position: absolute;
  right: 14px;
  bottom: 16px;
  z-index: 6;
  width: 244px;
  padding: 12px 14px 14px;
  border: 1px solid rgba(0, 229, 255, 0.25);
  border-radius: 6px;
  background: rgba(6, 17, 31, 0.92);
  box-shadow: 0 0 22px rgba(0, 229, 255, 0.12);
  backdrop-filter: blur(10px);
}

.perf-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.perf-tag {
  padding: 1px 6px;
  border: 1px solid rgba(0, 229, 255, 0.35);
  border-radius: 2px;
  color: var(--primary);
  font-size: 9px;
  letter-spacing: 0.1em;
}

.perf-title {
  color: var(--text);
  font-size: 12px;
}

.close {
  margin-left: auto;
  width: 18px;
  height: 18px;
  color: var(--text-dim);
  font-size: 16px;
  line-height: 1;
}

.fps {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  margin: 10px 0 8px;
}

.fps b {
  font-size: 30px;
  font-weight: 600;
  line-height: 1;
}

.fps b.good {
  color: var(--success);
}

.fps b.mid {
  color: var(--warning);
}

.fps b.bad {
  color: var(--alert);
}

.fps-meta {
  display: flex;
  flex-direction: column;
  color: var(--text-dim);
  font-size: 10px;
  line-height: 1.4;
}

.fps-meta em {
  font-style: normal;
  opacity: 0.7;
}

.metrics {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  margin: 0;
}

.metrics div {
  padding: 6px 8px;
  border: 1px solid rgba(0, 229, 255, 0.1);
  border-radius: 3px;
  background: rgba(0, 229, 255, 0.03);
}

.metrics dt {
  color: var(--text-dim);
  font-size: 9px;
}

.metrics dd {
  margin: 3px 0 0;
  color: var(--text);
  font-size: 12px;
}

.block {
  margin-top: 12px;
}

.block-label {
  display: block;
  margin-bottom: 6px;
  color: var(--text-dim);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.seg {
  display: flex;
  gap: 4px;
}

.seg button {
  flex: 1;
  padding: 5px 0;
  border: 1px solid rgba(0, 229, 255, 0.16);
  border-radius: 3px;
  color: var(--text-dim);
  font-size: 10px;
  background: rgba(0, 229, 255, 0.03);
}

.seg button.active {
  border-color: var(--primary);
  color: var(--primary);
  background: rgba(0, 229, 255, 0.12);
}

.tip {
  margin-top: 6px;
  color: var(--text-dim);
  font-size: 9px;
  line-height: 1.5;
  opacity: 0.75;
}

.effect-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 2px;
  color: var(--text-dim);
  font-size: 10px;
  text-align: left;
}

.effect-row i {
  width: 6px;
  height: 6px;
  border: 1px solid var(--text-dim);
  border-radius: 50%;
}

.effect-row.on {
  color: var(--text);
}

.effect-row.on i {
  border-color: var(--primary);
  background: var(--primary);
  box-shadow: 0 0 6px var(--primary);
}

.switch {
  margin-left: auto;
  font-size: 9px;
  opacity: 0.7;
}

.perf-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(0, 229, 255, 0.1);
}

.baseline {
  padding: 5px 10px;
  border: 1px solid rgba(0, 229, 255, 0.3);
  border-radius: 3px;
  color: var(--primary);
  font-size: 10px;
}

.baseline:hover {
  background: rgba(0, 229, 255, 0.1);
}

.delta {
  color: var(--success);
  font-size: 11px;
}

.delta.down {
  color: var(--alert);
}
</style>
