export type FriendlyErrorPayload = {
  title: string
  message: string
  actions: string[]
  severity: 'info' | 'warn' | 'error'
  retryable: boolean
}

export interface ApiError {
  success: false
  error_code: string
  message: string
  friendly: FriendlyErrorPayload
  details?: Record<string, unknown>
}

export interface ApiOk<T = unknown> {
  success: true
  message?: string
  data?: T
}
