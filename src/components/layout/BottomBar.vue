<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'
import { formatSeconds } from '@/utils/time'

const store = useDashboardStore()

const startText = computed(() => formatSeconds(store.playbackWindow.start))
const endText = computed(() => formatSeconds(store.playbackWindow.end))

const trackCount = computed(() => ({
  vehicle: store.tracks.filter((item) => item.kind === 'vehicle').length,
  person: store.tracks.filter((item) => item.kind === 'person').length,
}))

function onSlide(event: Event) {
  const value = Number((event.target as HTMLInputElement).value)
  store.setTrackProgress(value / 1000)
}

function onSelect(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  store.selectTrack(value || null)
}
</script>

<template>
  <footer class="bottombar">
    <div class="playback">
      <span class="label">轨迹回放</span>
      <button class="play" :class="{ active: store.trackPlaying }" @click="store.toggleTrackPlaying()">
        <span v-if="store.trackPlaying" class="pause-icon"><i></i><i></i></span>
        <span v-else class="play-icon"></span>
      </button>
      <div class="track">
        <span class="progress" :style="{ width: `${store.trackProgress * 100}%` }"></span>
        <span class="thumb" :style="{ left: `${store.trackProgress * 100}%` }"></span>
        <input
          class="range"
          type="range"
          min="0"
          max="1000"
          step="1"
          :value="Math.round(store.trackProgress * 1000)"
          @input="onSlide"
        />
      </div>
      <span class="time num">{{ startText }}</span>
      <span class="time num current">{{ store.playbackTime }}</span>
      <span class="time num">{{ endText }}</span>
      <select class="track-select" :value="store.selectedTrackId ?? ''" @change="onSelect">
        <option value="">全部轨迹</option>
        <option v-for="meta in store.tracks" :key="meta.id" :value="meta.id">
          {{ meta.name }}
        </option>
      </select>
    </div>

    <div class="legend">
      <span class="legend-item"><i class="vehicle"></i>车辆 {{ trackCount.vehicle }}</span>
      <span class="legend-item"><i class="person"></i>人员 {{ trackCount.person }}</span>
      <span class="legend-sep"></span>
      <span class="legend-item"><i class="normal"></i>正常</span>
      <span class="legend-item"><i class="warning"></i>预警</span>
      <span class="legend-item"><i class="offline"></i>离线</span>
    </div>

    <div class="actions">
      <span v-if="store.trackVisible" class="playback-tag">回放中 · {{ store.playbackTime }}</span>
      <button class="perf-btn" :class="{ active: store.perfVisible }" @click="store.togglePerf()">
        性能监视
      </button>
      <span class="demo-tag">演示数据</span>
    </div>
  </footer>
</template>

<style scoped lang="scss">
.bottombar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 18px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel);
  box-shadow: var(--shadow-panel);
}

.playback {
  display: flex;
  align-items: center;
  gap: 10px;
}

.label {
  color: var(--text-dim);
  font-size: 12px;
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.play {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(0, 229, 255, 0.35);
  border-radius: 50%;
  background: rgba(0, 229, 255, 0.06);
}

.play:hover,
.play.active {
  border-color: var(--primary);
  box-shadow: 0 0 10px rgba(0, 229, 255, 0.35);
}

.play-icon {
  width: 0;
  height: 0;
  margin-left: 2px;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 8px solid var(--primary);
}

.pause-icon {
  display: flex;
  gap: 3px;
}

.pause-icon i {
  width: 2px;
  height: 9px;
  background: var(--primary);
}

.track {
  position: relative;
  width: 330px;
  height: 4px;
  border-radius: 2px;
  background: rgba(0, 229, 255, 0.12);
}

.progress {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, rgba(0, 229, 255, 0.25), var(--primary));
}

.thumb {
  position: absolute;
  top: 50%;
  width: 10px;
  height: 10px;
  border: 1px solid var(--primary);
  border-radius: 50%;
  background: var(--bg-deep);
  box-shadow: 0 0 10px var(--primary);
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.range {
  position: absolute;
  inset: -8px 0;
  width: 100%;
  height: 20px;
  opacity: 0;
  cursor: pointer;
}

.time {
  color: var(--text-dim);
  font-size: 11px;
  white-space: nowrap;
}

.time.current {
  padding: 3px 8px;
  border: 1px solid rgba(0, 229, 255, 0.35);
  border-radius: 3px;
  color: var(--primary);
  font-size: 12px;
  background: rgba(0, 229, 255, 0.08);
}

.track-select {
  width: 108px;
  padding: 5px 6px;
  border: 1px solid rgba(0, 229, 255, 0.24);
  border-radius: 3px;
  color: var(--text);
  font-size: 11px;
  background: rgba(5, 11, 20, 0.85);
  outline: none;
}

.track-select option {
  background: #08111d;
}

.legend {
  display: flex;
  align-items: center;
  gap: 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-dim);
  font-size: 11px;
}

.legend-item i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.legend-sep {
  width: 1px;
  height: 12px;
  background: rgba(0, 229, 255, 0.18);
}

.vehicle {
  background: var(--primary);
  box-shadow: 0 0 6px var(--primary);
}

.person {
  background: var(--success);
  box-shadow: 0 0 6px var(--success);
}

.normal {
  background: var(--success);
  box-shadow: 0 0 6px var(--success);
}

.warning {
  background: var(--warning);
  box-shadow: 0 0 6px var(--warning);
}

.offline {
  background: var(--alert);
  box-shadow: 0 0 6px var(--alert);
}

.actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.playback-tag {
  padding: 4px 8px;
  border: 1px solid rgba(0, 229, 255, 0.3);
  border-radius: 3px;
  color: var(--primary);
  font-size: 10px;
  background: rgba(0, 229, 255, 0.07);
}

.perf-btn {
  padding: 5px 10px;
  border: 1px solid rgba(0, 229, 255, 0.24);
  border-radius: 3px;
  color: var(--text-dim);
  font-size: 10px;
  letter-spacing: 0.06em;
}

.perf-btn:hover,
.perf-btn.active {
  border-color: var(--primary);
  color: var(--primary);
  background: rgba(0, 229, 255, 0.08);
}

.demo-tag {
  padding: 5px 9px;
  border: 1px solid rgba(107, 140, 168, 0.3);
  border-radius: 3px;
  color: var(--text-dim);
  font-size: 10px;
  letter-spacing: 0.08em;
}
</style>
