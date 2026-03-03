export interface ApiError {
  success: false
  error_code: string
  message: string
  details?: Record<string, unknown>
}

export interface ApiOk<T = unknown> {
  success: true
  message?: string
  data?: T
}
