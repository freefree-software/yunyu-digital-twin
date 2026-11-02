import type { AlertItem, RealtimeDevicePayload, RealtimeStatus } from '@/types/domain'

export interface RealtimeHandlers {
  onAlert: (alert: AlertItem) => void
  onDevice: (payload: RealtimeDevicePayload) => void
  onStatus: (status: RealtimeStatus) => void
  nextAlert: () => AlertItem | null
  nextDevice: () => RealtimeDevicePayload | null
}

/**
 * 本地模拟 WebSocket 链路：每 5s 交替推送告警 / 设备状态。
 * 断线后 3s 自动重连，并把断线前最后一条消息重发一次，由业务层按 ID 去重。
 */
export class MockRealtimeLink {
  private timer: number | undefined
  private reconnectTimer: number | undefined
  private tick = 0
  private alive = false
  private lastAlert: AlertItem | null = null

  constructor(
    private handlers: RealtimeHandlers,
    private interval = 5000,
  ) {}

  connect() {
    this.alive = true
    this.handlers.onStatus('connected')
    this.timer = window.setInterval(() => this.push(), this.interval)
  }

  /** 模拟断线：停止推送，3 秒后自动重连 */
  drop() {
    if (!this.alive) return
    this.stopTimer()
    this.handlers.onStatus('reconnecting')
    this.reconnectTimer = window.setTimeout(() => {
      if (!this.alive) return
      this.connect()
      if (this.lastAlert) this.handlers.onAlert(this.lastAlert)
    }, 3000)
  }

  destroy() {
    this.alive = false
    this.stopTimer()
    if (this.reconnectTimer) window.clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
  }

  private stopTimer() {
    if (this.timer) window.clearInterval(this.timer)
    this.timer = undefined
  }

  private push() {
    this.tick += 1
    if (this.tick % 2 === 1) {
      const alert = this.handlers.nextAlert()
      if (alert) {
        this.lastAlert = alert
        this.handlers.onAlert(alert)
        return
      }
    }
    const device = this.handlers.nextDevice()
    if (device) this.handlers.onDevice(device)
  }
}
