<script setup lang="ts">
import TopBar from '@/components/layout/TopBar.vue'
import LeftPanel from '@/components/layout/LeftPanel.vue'
import RightPanel from '@/components/layout/RightPanel.vue'
import BottomBar from '@/components/layout/BottomBar.vue'
import TourOverlay from '@/components/layout/TourOverlay.vue'
import CesiumViewer from '@/components/scene/CesiumViewer.vue'
import { useScreenScale } from '@/composables/useScreenScale'
import { useDashboardStore } from '@/stores/dashboard'
import { onBeforeUnmount, onMounted } from 'vue'

const { scale } = useScreenScale()
const store = useDashboardStore()

function onKeydown(event: KeyboardEvent) {
  const tag = (event.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  if (event.key === 'r' || event.key === 'R') {
    event.preventDefault()
    store.startTour()
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="viewport">
    <div class="stage" :style="{ transform: `translate(-50%, -50%) scale(${scale})` }">
      <TopBar />
      <main class="body">
        <LeftPanel />
        <CesiumViewer />
        <RightPanel />
      </main>
      <TourOverlay />
      <BottomBar />
    </div>
  </div>
</template>

<style scoped lang="scss">
.viewport {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

.stage {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 1920px;
  height: 1080px;
  padding: 16px 20px 14px;
  transform-origin: center center;
}

.body {
  display: grid;
  flex: 1;
  grid-template-columns: 360px minmax(0, 1fr) 380px;
  gap: 12px;
  min-height: 0;
}
</style>
