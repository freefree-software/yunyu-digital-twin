<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps<{
  times: string[]
  values: number[]
  activeIndex?: number | null
}>()

const emit = defineEmits<{ pick: [index: number] }>()

const container = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | undefined
let observer: ResizeObserver | undefined

function buildOption(): echarts.EChartsOption {
  const active =
    props.activeIndex !== null && props.activeIndex !== undefined && props.activeIndex >= 0
      ? props.activeIndex
      : null

  return {
    animationDuration: 600,
    grid: { top: 12, right: 8, bottom: 22, left: 28 },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(5, 11, 20, 0.92)',
      borderColor: 'rgba(0, 229, 255, 0.35)',
      textStyle: { color: '#d7e7f7', fontSize: 11 },
    },
    xAxis: {
      type: 'category',
      data: props.times,
      boundaryGap: false,
      axisLine: { lineStyle: { color: 'rgba(107, 140, 168, 0.25)' } },
      axisTick: { show: false },
      axisLabel: { color: '#6b8ca8', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitNumber: 3,
      axisLabel: { color: '#6b8ca8', fontSize: 10 },
      splitLine: { lineStyle: { color: 'rgba(107, 140, 168, 0.12)' } },
    },
    series: [
      {
        name: '告警数',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 5,
        data: props.values,
        lineStyle: { color: '#00e5ff', width: 2 },
        itemStyle: { color: '#00e5ff' },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(0, 229, 255, 0.32)' },
            { offset: 1, color: 'rgba(0, 229, 255, 0.02)' },
          ]),
        },
        markPoint:
          active === null
            ? undefined
            : {
                symbol: 'circle',
                symbolSize: 16,
                itemStyle: {
                  color: 'rgba(255, 181, 71, 0.25)',
                  borderColor: '#ffb547',
                  borderWidth: 1.5,
                },
                label: { show: false },
                data: [
                  {
                    name: props.times[active],
                    coord: [props.times[active], props.values[active]],
                  },
                ],
              },
      },
    ],
  }
}

onMounted(() => {
  if (!container.value) return
  chart = echarts.init(container.value)
  chart.setOption(buildOption())

  // 整块绘图区都可点选：按横向像素映射到最近的小时档位
  chart.getZr().on('click', (event) => {
    if (!chart || props.times.length < 2) return
    const width = chart.getWidth()
    const plot = Math.max(1, width - 36)
    const ratio = (event.offsetX - 28) / plot
    if (ratio < -0.03 || ratio > 1.03) return
    const index = Math.round(ratio * (props.times.length - 1))
    emit('pick', Math.min(props.times.length - 1, Math.max(0, index)))
  })

  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(container.value)
})

watch(
  () => [props.times, props.values, props.activeIndex],
  () => chart?.setOption(buildOption(), true),
  { deep: true },
)

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = undefined
})
</script>

<template>
  <div ref="container" class="chart"></div>
</template>

<style scoped>
.chart {
  width: 100%;
  height: 100%;
}
</style>
