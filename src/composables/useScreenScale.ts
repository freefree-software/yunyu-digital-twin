import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useScreenScale(designWidth = 1920, designHeight = 1080) {
  const scale = ref(1)

  function update() {
    scale.value = Math.min(window.innerWidth / designWidth, window.innerHeight / designHeight)
  }

  onMounted(() => {
    update()
    window.addEventListener('resize', update)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', update)
  })

  return { scale }
}
