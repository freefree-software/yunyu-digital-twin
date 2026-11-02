<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useDashboardStore } from '@/stores/dashboard'

const store = useDashboardStore()

interface SearchResult {
  key: string
  kind: 'building' | 'device'
  id: string
  title: string
  sub: string
}

const query = ref('')
const open = ref(false)
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

const results = computed<SearchResult[]>(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return []

  const buildingHits = store.buildings
    .filter(
      (item) =>
        item.name.toLowerCase().includes(keyword) || item.id.toLowerCase().includes(keyword),
    )
    .slice(0, 4)
    .map<SearchResult>((item) => ({
      key: `b-${item.id}`,
      kind: 'building',
      id: item.id,
      title: item.name,
      sub: `${item.district} · ${item.floors}F · ${item.deviceCount} 台设备`,
    }))

  const deviceHits = store.devices
    .filter(
      (item) =>
        item.name.toLowerCase().includes(keyword) ||
        item.buildingName.toLowerCase().includes(keyword) ||
        item.type.toLowerCase().includes(keyword),
    )
    .slice(0, 5)
    .map<SearchResult>((item) => ({
      key: `d-${item.id}`,
      kind: 'device',
      id: item.id,
      title: item.name,
      sub: `${item.buildingName} · ${item.floor}F · ${item.type}`,
    }))

  return [...buildingHits, ...deviceHits].slice(0, 8)
})

function choose(result: SearchResult) {
  if (result.kind === 'building') store.selectBuilding(result.id)
  else store.selectDevice(result.id)
  query.value = ''
  open.value = false
  inputRef.value?.blur()
}

function onInput() {
  open.value = true
  activeIndex.value = 0
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    open.value = false
    inputRef.value?.blur()
    return
  }
  if (!results.value.length) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value + 1) % results.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    activeIndex.value = (activeIndex.value - 1 + results.value.length) % results.value.length
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const target = results.value[activeIndex.value]
    if (target) choose(target)
  }
}

function onGlobalKey(event: KeyboardEvent) {
  const tag = (event.target as HTMLElement | null)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
  if (event.key === '/') {
    event.preventDefault()
    inputRef.value?.focus()
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))
</script>

<template>
  <div class="search" :class="{ open }">
    <span class="search-icon"></span>
    <input
      ref="inputRef"
      v-model="query"
      class="search-input"
      type="text"
      placeholder="搜索楼栋 / 设备"
      @input="onInput"
      @focus="open = true"
      @keydown="onKeydown"
      @blur="open = false"
    />
    <kbd class="search-kbd">/</kbd>

    <ul v-if="open && results.length" class="result-list">
      <li
        v-for="(result, index) in results"
        :key="result.key"
        class="result"
        :class="{ active: index === activeIndex }"
        @mousedown.prevent="choose(result)"
        @mouseenter="activeIndex = index"
      >
        <span class="result-kind" :class="result.kind">
          {{ result.kind === 'building' ? '楼' : '设' }}
        </span>
        <div class="result-text">
          <span class="result-title">{{ result.title }}</span>
          <span class="result-sub">{{ result.sub }}</span>
        </div>
      </li>
    </ul>

    <p v-else-if="open && query.trim()" class="empty">未找到匹配的楼栋或设备</p>
  </div>
</template>

<style scoped lang="scss">
.search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 250px;
  height: 32px;
  padding: 0 10px;
  border: 1px solid rgba(0, 229, 255, 0.18);
  border-radius: 4px;
  background: rgba(0, 229, 255, 0.04);
  transition: border-color 160ms ease, background 160ms ease;
}

.search:focus-within,
.search.open {
  border-color: rgba(0, 229, 255, 0.55);
  background: rgba(0, 229, 255, 0.08);
}

.search-icon {
  position: relative;
  width: 10px;
  height: 10px;
  border: 1.5px solid var(--text-dim);
  border-radius: 50%;
  flex-shrink: 0;
}

.search-icon::after {
  content: '';
  position: absolute;
  right: -4px;
  bottom: -3px;
  width: 5px;
  height: 1.5px;
  background: var(--text-dim);
  transform: rotate(45deg);
}

.search-input {
  flex: 1;
  min-width: 0;
  border: 0;
  color: var(--text);
  font-size: 12px;
  background: transparent;
  outline: none;
}

.search-input::placeholder {
  color: var(--text-dim);
}

.search-kbd {
  padding: 1px 5px;
  border: 1px solid rgba(107, 140, 168, 0.3);
  border-radius: 2px;
  color: var(--text-dim);
  font-size: 9px;
}

.result-list {
  position: absolute;
  top: 38px;
  left: 0;
  z-index: 20;
  width: 320px;
  padding: 4px;
  border: 1px solid rgba(0, 229, 255, 0.25);
  border-radius: 4px;
  background: rgba(6, 17, 31, 0.96);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  list-style: none;
}

.result {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 3px;
  cursor: pointer;
}

.result.active {
  background: rgba(0, 229, 255, 0.1);
}

.result-kind {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 1px solid rgba(0, 229, 255, 0.35);
  border-radius: 2px;
  color: var(--primary);
  font-size: 10px;
  flex-shrink: 0;
}

.result-kind.device {
  border-color: rgba(255, 181, 71, 0.4);
  color: var(--warning);
}

.result-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.result-title {
  color: var(--text);
  font-size: 12px;
}

.result-sub {
  color: var(--text-dim);
  font-size: 10px;
}

.empty {
  position: absolute;
  top: 38px;
  left: 0;
  width: 250px;
  padding: 10px 12px;
  border: 1px solid rgba(0, 229, 255, 0.16);
  border-radius: 4px;
  color: var(--text-dim);
  font-size: 11px;
  background: rgba(6, 17, 31, 0.96);
}
</style>
