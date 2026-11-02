<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { Device } from '@/types/domain'

const props = defineProps<{ device: Device }>()

const container = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | undefined
let timer: number | undefined
let labelSeed = 0

const times: string[] = []
const temperatures: number[] = []
const currents: number[] = []

function seedFor(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = (hash * 31 + id.charCodeAt(index)) % 997
  return hash / 997
}

function resetHistory() {
  times.length = 0
  temperatures.length = 0
  currents.length = 0
  labelSeed = 0

  const seed = seedFor(props.device.id)
  const baseTemp = props.device.temperature
  const baseCurrent = props.device.current
  const now = new Date()

  for (let index = 17; index >= 0; index -= 1) {
    const stamp = new Date(now.getTime() - index * 20000)
    times.push(stamp.toLocaleTimeString('zh-CN', { hour12: false }).slice(0, 5))
    const wave = Math.sin((labelSeed + index) * 0.7 + seed * 6) * 0.8
    temperatures.push(Math.round((baseTemp + wave) * 10) / 10)
    currents.push(Math.round((baseCurrent + wave * 0.4) * 100) / 100)
  }
  labelSeed += 18
}

function pushPoint() {
  const lastTemp = temperatures[temperatures.length - 1] ?? props.device.temperature
  const lastCurrent = currents[currents.length - 1] ?? props.device.current
  const temp = Math.round((lastTemp + (Math.random() - 0.5) * 1.4) * 10) / 10
  const current = Math.round((lastCurrent + (Math.random() - 0.5) * 0.5) * 100) / 100
  times.push(new Date().toLocaleTimeString('zh-CN', { hour12: false }).slice(0, 5))
  temperatures.push(temp)
  currents.push(current)
  if (times.length > 24) {
    times.shift()
    temperatures.shift()
    currents.shift()
  }
  chart?.setOption(option())
}

function option(): echarts.EChartsOption {
  return {
    animation: false,
    grid: { top: 22, right: 30, bottom: 18, left: 32 },
    legend: {
      top: 0,
      right: 0,
      itemWidth: 8,
      itemHeight: 8,
      textStyle: { color: '#6b8ca8', fontSize: 9 },
      data: ['温度', '电流'],
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(5, 11, 20, 0.92)',
      borderColor: 'rgba(0, 229, 255, 0.35)',
      textStyle: { color: '#d7e7f7', fontSize: 10 },
    },
    xAxis: {
      type: 'category',
      data: times,
      boundaryGap: false,
      axisLine: { lineStyle: { color: 'rgba(107, 140, 168, 0.2)' } },
      axisTick: { show: false },
      axisLabel: { color: '#6b8ca8', fontSize: 9, interval: 5 },
    },
    yAxis: [
      {
        type: 'value',
        scale: true,
        axisLabel: { color: '#6b8ca8', fontSize: 9 },
        splitLine: { lineStyle: { color: 'rgba(107, 140, 168, 0.1)' } },
      },
      {
        type: 'value',
        scale: true,
        axisLabel: { color: '#6b8ca8', fontSize: 9 },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '温度',
        type: 'line',
        smooth: true,
        symbol: 'none',
        data: temperatures,
        lineStyle: { color: '#ffb547', width: 1.6 },
      },
      {
        name: '电流',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        symbol: 'none',
        data: currents,
        lineStyle: { color: '#00e5ff', width: 1.4 },
      },
    ],
  }
}

onMounted(() => {
  if (!container.value) return
  resetHistory()
  chart = echarts.init(container.value)
  chart.setOption(option())
  timer = window.setInterval(pushPoint, 2000)
})

watch(
  () => props.device.id,
  () => {
    resetHistory()
    chart?.setOption(option(), true)
  },
)

onBeforeUnmount(() => {
  if (timer) window.clearInterval(timer)
  chart?.dispose()
  chart = undefined
})
</script>

<template>
  <div ref="container" class="device-chart"></div>
</template>

<style scoped>
.device-chart {
  width: 100%;
  height: 118px;
}
</style>
