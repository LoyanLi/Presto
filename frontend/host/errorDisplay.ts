import type { PrestoErrorPayload } from '@presto/contracts'

function isPrestoErrorPayload(value: unknown): value is PrestoErrorPayload {
  return Boolean(
    value
    && typeof value === 'object'
    && 'code' in value
    && typeof value.code === 'string'
    && 'source' in value
    && typeof value.source === 'string'
    && 'retryable' in value
    && typeof value.retryable === 'boolean',
  )
}

export function formatHostErrorMessage(error: unknown, fallback: string): string {
  if (isPrestoErrorPayload(error)) {
    const code = error.code.trim()
    const message = typeof error.message === 'string' ? error.message.trim() : ''

    if (code && message && message !== code) {
      return `${code}: ${message}`
    }

    if (code) {
      return code
    }

    if (message) {
      return message
    }
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }

  return fallback
}
