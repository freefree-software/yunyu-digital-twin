/** "HH:MM:SS" → 秒 */
export function toSeconds(value: string): number {
  const [h = 0, m = 0, s = 0] = value.split(':').map(Number)
  return h * 3600 + m * 60 + s
}

/** 秒 → "HH:MM:SS" */
export function formatSeconds(total: number): string {
  const safe = Math.max(0, Math.round(total))
  const h = Math.floor(safe / 3600)
  const m = Math.floor((safe % 3600) / 60)
  const s = safe % 60
  return [h, m, s].map((item) => String(item).padStart(2, '0')).join(':')
}
