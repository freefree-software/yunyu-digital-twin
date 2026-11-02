<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'

const store = useDashboardStore()

const step = computed(() => store.tourSteps[store.tour.step])
const indexText = computed(
  () => `${String(store.tour.step + 1).padStart(2, '0')} / ${String(store.tourSteps.length).padStart(2, '0')}`,
)
</script>

<template>
  <section v-if="store.tour.active" class="tour">
    <div class="tour-head">
      <span class="tour-badge">一键漫游</span>
      <span class="tour-index num">{{ indexText }}</span>
      <button class="tour-exit" @click="store.stopTour()">退出</button>
    </div>

    <div class="tour-body">
      <h2>{{ step?.title }}</h2>
      <p>{{ step?.desc }}</p>
    </div>

    <div class="tour-progress">
      <span class="bar" :style="{ width: `${store.tour.progress * 100}%` }"></span>
    </div>

    <div class="tour-foot">
      <div class="dots">
        <button
          v-for="(item, index) in store.tourSteps"
          :key="item.key"
          class="dot"
          :class="{ active: index === store.tour.step, done: index < store.tour.step }"
          :title="item.title"
          @click="store.jumpTourStep(index)"
        ></button>
      </div>
      <div class="actions">
        <button @click="store.prevTourStep()">上一段</button>
        <button @click="store.nextTourStep()">下一段</button>
      </div>
    </div>
  </section>
</template>

<style scoped lang="scss">
.tour {
  position: absolute;
  top: 78px;
  left: 50%;
  z-index: 9;
  width: 560px;
  padding: 14px 18px 12px;
  border: 1px solid rgba(0, 229, 255, 0.35);
  border-radius: 6px;
  background: rgba(5, 14, 26, 0.92);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45), 0 0 26px rgba(0, 229, 255, 0.12);
  transform: translateX(-50%);
  backdrop-filter: blur(10px);
}

.tour-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tour-badge {
  padding: 2px 7px;
  border: 1px solid rgba(0, 229, 255, 0.35);
  border-radius: 2px;
  color: var(--primary);
  font-size: 9px;
  letter-spacing: 0.12em;
}

.tour-index {
  color: var(--text-dim);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.tour-exit {
  margin-left: auto;
  padding: 3px 8px;
  border: 1px solid rgba(107, 140, 168, 0.3);
  border-radius: 3px;
  color: var(--text-dim);
  font-size: 10px;
}

.tour-exit:hover {
  border-color: var(--alert);
  color: var(--alert);
}

.tour-body {
  margin-top: 10px;
}

.tour-body h2 {
  color: var(--text);
  font-size: 17px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.tour-body p {
  margin-top: 6px;
  color: var(--text-dim);
  font-size: 12px;
  line-height: 1.7;
}

.tour-progress {
  position: relative;
  height: 3px;
  margin-top: 12px;
  border-radius: 2px;
  background: rgba(0, 229, 255, 0.12);
  overflow: hidden;
}

.tour-progress .bar {
  position: absolute;
  inset: 0 auto 0 0;
  background: linear-gradient(90deg, rgba(0, 229, 255, 0.3), var(--primary));
}

.tour-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 12px;
}

.dots {
  display: flex;
  gap: 6px;
}

.dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(107, 140, 168, 0.45);
}

.dot.done {
  background: rgba(0, 229, 255, 0.4);
}

.dot.active {
  background: var(--primary);
  box-shadow: 0 0 8px var(--primary);
}

.actions {
  display: flex;
  gap: 6px;
}

.actions button {
  padding: 4px 10px;
  border: 1px solid rgba(0, 229, 255, 0.25);
  border-radius: 3px;
  color: var(--text-dim);
  font-size: 10px;
}

.actions button:hover {
  border-color: var(--primary);
  color: var(--primary);
}
</style>
