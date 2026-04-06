type AppLogLevel = 'info' | 'warn' | 'error'

type AppLogEntry = {
  level: AppLogLevel
  source: string
  message: string
  details: Record<string, unknown> | null
}

type RpcRequestLike = {
  id?: string
  operation?: string
}

function formatErrorReason(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error ?? 'unknown_error')
}

function compactDetails(details: Record<string, unknown>): Record<string, unknown> | null {
  const filtered = Object.fromEntries(
    Object.entries(details).filter(([, value]) => value !== null && value !== undefined && value !== ''),
  )
  return Object.keys(filtered).length > 0 ? filtered : null
}

export function createSidecarRpcErrorLogEntry(request: RpcRequestLike, error: unknown): AppLogEntry {
  return {
    level: 'error',
    source: 'sidecar.rpc',
    message: `${String(request.operation ?? 'unknown_operation')} ${formatErrorReason(error)}`,
    details: compactDetails({
      requestId: request.id ? String(request.id) : null,
    }),
  }
}

export function createSidecarParseErrorLogEntry(error: unknown): AppLogEntry {
  return {
    level: 'error',
    source: 'sidecar.rpc',
    message: `request.parse ${formatErrorReason(error)}`,
    details: null,
  }
}

export function createSidecarBootstrapErrorLogEntry(error: unknown): AppLogEntry {
  return {
    level: 'error',
    source: 'sidecar.bootstrap',
    message: formatErrorReason(error),
    details: null,
  }
}
