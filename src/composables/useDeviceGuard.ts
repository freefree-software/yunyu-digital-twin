import { onBeforeUnmount, onMounted, ref } from 'vue'

const MOBILE_UA = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS|Windows Phone/i

function detectMobile() {
  if (typeof window === 'undefined') return false
  const uaHit = MOBILE_UA.test(navigator.userAgent)
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches
  return uaHit || (coarsePointer && window.innerWidth <= 1024)
}

export function useDeviceGuard() {
  const isMobile = ref(detectMobile())

  function update() {
    isMobile.value = detectMobile()
  }

  onMounted(() => {
    update()
    window.addEventListener('resize', update)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('resize', update)
  })

  return { isMobile }
}
