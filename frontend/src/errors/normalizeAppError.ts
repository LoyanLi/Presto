import type { ApiError, FriendlyErrorPayload } from '../types/common'

const PRESTO_API_ERROR_PREFIX = '__PRESTO_API_ERROR__'

export type FriendlyErrorView = {
  code: string
  userTitle: string
  userMessage: string
  actions: string[]
  severity: 'info' | 'warn' | 'error'
  retryable: boolean
  technicalMessage: string
  details?: Record<string, unknown>
}

export function makeLocalFriendlyError(
  userMessage: string,
  options?: {
    code?: string
    userTitle?: string
    actions?: string[]
    severity?: 'info' | 'warn' | 'error'
    retryable?: boolean
    technicalMessage?: string
    details?: Record<string, unknown>
  },
): FriendlyErrorView {
  return {
    code: options?.code ?? 'VALIDATION_ERROR',
    userTitle: options?.userTitle ?? '请先处理当前输入问题',
    userMessage,
    actions: options?.actions ?? ['修正后重试'],
    severity: options?.severity ?? 'warn',
    retryable: options?.retryable ?? true,
    technicalMessage: options?.technicalMessage ?? userMessage,
    details: options?.details,
  }
}

function isFriendlyPayload(value: unknown): value is FriendlyErrorPayload {
  if (!value || typeof value !== 'object') {
    return false
  }
  const payload = value as Partial<FriendlyErrorPayload>
  return (
    typeof payload.title === 'string' &&
    typeof payload.message === 'string' &&
    Array.isArray(payload.actions) &&
    typeof payload.severity === 'string' &&
    typeof payload.retryable === 'boolean'
  )
}

function isApiError(value: unknown): value is ApiError {
  if (!value || typeof value !== 'object') {
    return false
  }
  const payload = value as Partial<ApiError>
  return payload.success === false && typeof payload.error_code === 'string' && typeof payload.message === 'string'
}

function toFriendlyView(payload: ApiError): FriendlyErrorView {
  const fallbackFriendly: FriendlyErrorPayload = {
    title: '发生未知错误',
    message: '请重试；若持续失败，请导出日志并联系支持。',
    actions: ['重试当前操作', '导出日志', '联系支持并附上错误码'],
    severity: 'error',
    retryable: true,
  }
  const friendly = isFriendlyPayload(payload.friendly) ? payload.friendly : fallbackFriendly
  return {
    code: payload.error_code,
    userTitle: friendly.title,
    userMessage: friendly.message,
    actions: friendly.actions,
    severity: friendly.severity,
    retryable: friendly.retryable,
    technicalMessage: payload.message,
    details: payload.details,
  }
}

function tryParsePrefixedErrorMessage(message: string): ApiError | null {
  const prefixIndex = message.indexOf(PRESTO_API_ERROR_PREFIX)
  if (prefixIndex < 0) {
    return null
  }

  const raw = message.slice(prefixIndex + PRESTO_API_ERROR_PREFIX.length).trim()
  const candidates: string[] = [raw]

  const jsonStart = raw.indexOf('{')
  const jsonEnd = raw.lastIndexOf('}')
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    candidates.push(raw.slice(jsonStart, jsonEnd + 1))
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      if (isApiError(parsed)) {
        return parsed
      }
    } catch {
      // Try next candidate.
    }
  }

  return null
}

export function normalizeAppError(input: unknown): FriendlyErrorView {
  if (isApiError(input)) {
    return toFriendlyView(input)
  }

  if (input && typeof input === 'object' && 'response' in input) {
    const response = (input as { response?: { data?: unknown } }).response
    if (response && isApiError(response.data)) {
      return toFriendlyView(response.data)
    }
  }

  if (input && typeof input === 'object' && 'message' in input) {
    const error = input as { message?: unknown; cause?: unknown }
    if (typeof error.message === 'string') {
      const parsed = tryParsePrefixedErrorMessage(error.message)
      if (parsed) {
        return toFriendlyView(parsed)
      }
      const code = typeof (error.cause as { code?: unknown } | undefined)?.code === 'string'
        ? String((error.cause as { code?: unknown }).code)
        : 'UNEXPECTED_ERROR'
      return {
        code,
        userTitle: '操作失败',
        userMessage: '请检查当前状态后重试，必要时导出日志定位问题。',
        actions: ['重试当前操作', '确认 Pro Tools / 后端状态', '导出日志'],
        severity: 'error',
        retryable: true,
        technicalMessage: error.message,
      }
    }
  }

  const text = typeof input === 'string' ? input : String(input)
  return {
    code: 'UNEXPECTED_ERROR',
    userTitle: '操作失败',
    userMessage: '请重试；若持续失败，请导出日志并联系支持。',
    actions: ['重试当前操作', '导出日志'],
    severity: 'error',
    retryable: true,
    technicalMessage: text,
  }
}
