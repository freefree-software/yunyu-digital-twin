<template>
  <main class="blocker">
    <svg class="icon" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <rect x="8" y="12" width="48" height="32" rx="3" stroke="currentColor" stroke-width="2" />
      <path d="M24 52h16M32 44v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <path d="M20 28h24" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.5" />
    </svg>
    <h1>请使用 PC 端访问</h1>
    <p>云屿园区数字孪生运营平台为大屏演示项目，暂不支持移动端。</p>
    <p class="hint">请在电脑浏览器中打开，建议分辨率 1920×1080 及以上。</p>
  </main>
</template>

<style scoped lang="scss">
.blocker {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  padding: 32px;
  text-align: center;
  background: radial-gradient(circle at 50% 35%, #0a1a2e 0%, var(--bg) 60%, var(--bg-deep) 100%);
}

.icon {
  width: 72px;
  height: 72px;
  margin-bottom: 28px;
  color: var(--primary);
  filter: drop-shadow(0 0 12px rgba(0, 229, 255, 0.45));
}

h1 {
  margin-bottom: 14px;
  color: var(--text);
  font-size: 22px;
  font-weight: 600;
  letter-spacing: 0.08em;
}

p {
  max-width: 420px;
  color: var(--text-dim);
  font-size: 14px;
  line-height: 1.8;
}

.hint {
  margin-top: 10px;
  color: rgba(0, 229, 255, 0.65);
}
</style>
