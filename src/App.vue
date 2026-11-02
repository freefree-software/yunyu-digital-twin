<script setup lang="ts">
import MobileBlocker from '@/components/common/MobileBlocker.vue'
import DashboardView from '@/views/DashboardView.vue'
import { useDeviceGuard } from '@/composables/useDeviceGuard'

const { isMobile } = useDeviceGuard()
</script>

<template>
  <MobileBlocker v-if="isMobile" />
  <DashboardView v-else />
</template>
