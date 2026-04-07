import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { request as nodeHttpRequest } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CapabilityRequestEnvelope, CapabilityResponseEnvelope, DawTarget } from '@presto/contracts'
import type {
  BackendCapabilityDefinition,
  BackendLogEntry,
  BackendStatus,
} from '@presto/sdk-runtime/clients/backend'

export interface BackendSupervisor {
  start(): Promise<BackendStatus>
  stop(): Promise<BackendStatus>
  health(): Promise<BackendStatus>
  getStatus(): BackendStatus
  listCapabilities(): Promise<BackendCapabilityDefinition[]>
  invokeCapability<TRequest, TResponse>(
    request: CapabilityRequestEnvelope<TRequest>
  ): Promise<CapabilityResponseEnvelope<TResponse>>
}

export interface CreateBackendSupervisorOptions {
  targetDaw?: DawTarget
  requestJsonImpl?: typeof requestJson
  spawnImpl?: typeof spawn
  resolvePortImpl?: (preferredPort: number) => Promise<number>
  resolvePythonBinImpl?: () => string
  onLog?: (entry: Omit<BackendLogEntry, 'id' | 'timestamp'>) => void
}

type SupervisorPhase = 'stopped' | 'starting' | 'running' | 'stopping' | 'error'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const DEFAULT_PORT = Number(process.env.PRESTO_MAIN_BACKEND_PORT ?? '18500')
const BUNDLED_PYTHON_VERSION = '3.13'
const PYTHON_CANDIDATES = ['/usr/local/bin/python3', '/opt/homebrew/bin/python3', '/usr/bin/python3'] as const
const REQUIRED_PTSL_SYMBOLS = [
  'CId_SetTrackControlBreakpoints',
  'CId_GetTrackControlBreakpoints',
  'CId_GetTrackControlInfo',
  'TCType_Pan',
  'PCParameter_Pan',
  'PSpace_Stereo',
  'SetTrackControlBreakpointsRequestBody',
  'DeleteTracksRequestBody',
] as const

export function resolveBackendRoot({
  explicitBackendRoot = process.env.PRESTO_BACKEND_ROOT,
  currentDir: resolvedCurrentDir = currentDir,
  isPackaged = /(^|[\\/])app\.asar([\\/]|$)/.test(resolvedCurrentDir),
  resourcesPath = process.resourcesPath,
}: {
  explicitBackendRoot?: string
  currentDir?: string
  isPackaged?: boolean
  resourcesPath?: string
} = {}): string {
  if (explicitBackendRoot) {
    return path.resolve(explicitBackendRoot)
  }

  if (isPackaged) {
    return path.resolve(resourcesPath, 'backend/presto')
  }

  return path.resolve(resolvedCurrentDir, '../../../backend/presto')
}

export function resolveBundledPythonBin(resourcesDir = process.env.PRESTO_RESOURCES_DIR): string | null {
  if (!resourcesDir) {
    return null
  }

  const bundledPython = path.resolve(resourcesDir, 'backend', 'python', 'bin', 'python3')
  return existsSync(bundledPython) ? bundledPython : null
}

export function resolveBundledPythonHome(resourcesDir = process.env.PRESTO_RESOURCES_DIR): string | null {
  if (!resourcesDir) {
    return null
  }

  const bundledPythonHome = path.resolve(
    resourcesDir,
    'backend',
    'python',
    'Frameworks',
    'Python.framework',
    'Versions',
    BUNDLED_PYTHON_VERSION,
  )
  return existsSync(bundledPythonHome) ? bundledPythonHome : null
}

function pythonSupportsModernPtsl(pythonBin: string): boolean {
  const probeScript = `
import sys
try:
    import ptsl.PTSL_pb2 as pb2
except Exception:
    sys.exit(1)
required = ${JSON.stringify([...REQUIRED_PTSL_SYMBOLS])}
sys.exit(0 if all(hasattr(pb2, name) for name in required) else 1)
`

  try {
    const result = spawnSync(pythonBin, ['-c', probeScript], {
      stdio: 'ignore',
      timeout: 3000,
    })
    return result.status === 0
  } catch {
    return false
  }
}

export function resolveBackendPythonBin(): string {
  const bundledPython = resolveBundledPythonBin()
  if (bundledPython) {
    return bundledPython
  }

  const explicitPythonBin = process.env.PRESTO_PYTHON_BIN ?? process.env.PYTHON_BIN
  if (explicitPythonBin) {
    return explicitPythonBin
  }

  for (const candidate of PYTHON_CANDIDATES) {
    if (existsSync(candidate) && pythonSupportsModernPtsl(candidate)) {
      return candidate
    }
  }

  for (const candidate of PYTHON_CANDIDATES) {
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return '/usr/bin/python3'
}

function createStatus(phase: SupervisorPhase, lastError: string | null, logsCount: number): BackendStatus {
  return {
    running: phase === 'starting' || phase === 'running' || phase === 'stopping',
    ready: phase === 'running',
    pid: null,
    port: DEFAULT_PORT,
    status: phase,
    lastError,
    logsCount,
    warnings: [],
  }
}

function normalizeLogReason(value: unknown): string {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function toErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return normalizeLogReason(error.message)
  }
  return normalizeLogReason(error ?? fallback) || fallback
}

function requestJson<TResponse>(method: string, port: number, pathname: string, body?: unknown): Promise<TResponse> {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : JSON.stringify(body)
    const req = nodeHttpRequest(
      {
        host: '127.0.0.1',
        port,
        method,
        path: pathname,
        headers: payload
          ? {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(payload),
            }
          : undefined,
      },
      (response) => {
        const chunks = []
        response.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          try {
            resolve(text ? (JSON.parse(text) as TResponse) : ({} as TResponse))
          } catch (error) {
            reject(error)
          }
        })
      },
    )
    req.on('error', reject)
    if (payload) {
      req.write(payload)
    }
    req.end()
  })
}

type RawBackendCapabilityFieldSupport = {
  request_fields?: string[]
  response_fields?: string[]
}

type RawBackendCapabilityDefinition = {
  id: string
  version: number
  kind: string
  domain: string
  visibility: string
  description: string
  request_schema: string
  response_schema: string
  depends_on?: string[]
  supported_daws?: string[]
  canonical_source: string
  field_support?: Record<string, RawBackendCapabilityFieldSupport>
  handler: string
  emits_events?: string[]
}

type RawBackendCapabilitiesResponse = {
  capabilities?: RawBackendCapabilityDefinition[]
}

function normalizeCapabilityDefinition(
  capability: RawBackendCapabilityDefinition,
): BackendCapabilityDefinition {
  return {
    id: capability.id,
    version: capability.version,
    kind: capability.kind,
    domain: capability.domain,
    visibility: capability.visibility,
    description: capability.description,
    requestSchema: capability.request_schema,
    responseSchema: capability.response_schema,
    dependsOn: capability.depends_on ?? [],
    supportedDaws: capability.supported_daws ?? [],
    canonicalSource: capability.canonical_source,
    fieldSupport: Object.fromEntries(
      Object.entries(capability.field_support ?? {}).map(([target, support]) => [
        target,
        {
          requestFields: support.request_fields ?? [],
          responseFields: support.response_fields ?? [],
        },
      ]),
    ),
    handler: capability.handler,
    emitsEvents: capability.emits_events ?? [],
  }
}

async function resolveAvailablePort(preferredPort: number): Promise<number> {
  const tryListen = (port: number) =>
    new Promise<number>((resolve, reject) => {
      const server = createNetServer()
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => {
        const address = server.address()
        const resolvedPort =
          address && typeof address === 'object' && typeof address.port === 'number'
            ? address.port
            : port
        server.close((closeError) => {
          if (closeError) {
            reject(closeError)
            return
          }
          resolve(resolvedPort)
        })
      })
    })

  try {
    await tryListen(preferredPort)
    return preferredPort
  } catch {
    return tryListen(0)
  }
}

async function waitForHealthy(port: number): Promise<void> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      await requestJson('GET', port, '/api/v1/health')
      return
    } catch (_error) {
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  }
  throw new Error(`backend_not_ready_on_port_${port}`)
}

export function createBackendSupervisor(options: CreateBackendSupervisorOptions = {}): BackendSupervisor {
  let phase: SupervisorPhase = 'stopped'
  let lastError: string | null = null
  let logsCount = 0
  let processHandle: ChildProcessWithoutNullStreams | null = null
  let currentPort = DEFAULT_PORT
  const targetDaw = options.targetDaw ?? 'pro_tools'
  const requestImpl = options.requestJsonImpl ?? requestJson
  const spawnImpl = options.spawnImpl ?? spawn
  const resolvePort = options.resolvePortImpl ?? resolveAvailablePort
  const resolveBackendWorkingDir = () => path.resolve(resolveBackendRoot(), '..')
  const log = (level: 'info' | 'warn' | 'error', message: string, details?: Record<string, unknown>) => {
    options.onLog?.({
      source: 'backend.supervisor',
      level,
      message,
      details: details ?? null,
    })
  }
  const logFailure = (
    level: 'warn' | 'error',
    operation: string,
    error: unknown,
    details?: Record<string, unknown>,
  ): string => {
    const reason = toErrorMessage(error, `${operation}_failed`)
    lastError = reason
    log(level, `${operation} ${reason}`, details)
    return reason
  }

  const snapshot = (): BackendStatus => ({
    ...createStatus(phase, lastError, logsCount),
    port: currentPort,
  })

  const transition = (nextPhase: SupervisorPhase): BackendStatus => {
    phase = nextPhase
    logsCount += 1
    log('info', `backend_${nextPhase}`, { phase: nextPhase, port: currentPort })
    return snapshot()
  }

  const isRecoverableRequestError = (error: unknown): boolean => {
    const code = typeof error === 'object' && error && 'code' in error ? String(error.code ?? '') : ''
    const message = error instanceof Error ? error.message : String(error ?? '')
    return (
      code === 'ECONNRESET' ||
      code === 'ECONNREFUSED' ||
      code === 'EPIPE' ||
      /socket hang up/i.test(message) ||
      /ECONNRESET/i.test(message) ||
      /ECONNREFUSED/i.test(message)
    )
  }

  const restart = async (): Promise<BackendStatus> => {
    if (processHandle) {
      try {
        processHandle.kill('SIGTERM')
      } catch {
        // Ignore stale process handles during best-effort restart.
      }
      processHandle = null
    }
    phase = 'stopped'
    return thisSupervisor.start()
  }

  const ensureAvailable = async (): Promise<void> => {
    if (phase === 'stopped' || phase === 'error' || !processHandle) {
      await thisSupervisor.start()
      return
    }

    try {
      await requestImpl('GET', currentPort, '/api/v1/health')
    } catch (error) {
      if (!isRecoverableRequestError(error)) {
        logFailure('error', 'backend.ensure_available', error, {
          port: currentPort,
        })
        throw error
      }
      logFailure('warn', 'backend.ensure_available', error, {
        operation: 'ensure_available',
        port: currentPort,
      })
      await restart()
    }
  }

  const thisSupervisor: BackendSupervisor = {
    async start(): Promise<BackendStatus> {
      if (phase === 'running' || phase === 'starting') {
        return snapshot()
      }

      lastError = null
      transition('starting')
      currentPort = await resolvePort(DEFAULT_PORT)
      const bundledPythonBin = resolveBundledPythonBin()
      const pythonBin =
        bundledPythonBin ?? (options.resolvePythonBinImpl ? options.resolvePythonBinImpl() : resolveBackendPythonBin())
      const bundledPythonHome = bundledPythonBin ? resolveBundledPythonHome() : null
      processHandle = spawnImpl(pythonBin, ['-m', 'presto.main_api', '--host', '127.0.0.1', '--port', String(currentPort)], {
        cwd: resolveBackendWorkingDir(),
        env: {
          ...process.env,
          ...(bundledPythonHome ? { PYTHONHOME: bundledPythonHome } : {}),
          PYTHONUNBUFFERED: '1',
          PRESTO_TARGET_DAW: targetDaw,
        },
      })

      const spawnFailed = new Promise<never>((_resolve, reject) => {
        processHandle?.once('error', reject)
      })

      processHandle.stdout.on('data', () => {
        logsCount += 1
      })
      processHandle.stderr.on('data', (chunk) => {
        logsCount += 1
        const stderrMessage = normalizeLogReason(chunk)
        if (stderrMessage) {
          lastError = stderrMessage
          log('error', `backend.stderr ${stderrMessage}`, {
            port: currentPort,
          })
        }
      })
      processHandle.on('exit', (code) => {
        if (phase !== 'stopped') {
          phase = code === 0 ? 'stopped' : 'error'
        }
        log(code === 0 ? 'info' : 'error', 'backend_process_exit', {
          code,
          phase,
          port: currentPort,
        })
      })

      try {
        await Promise.race([
          (async () => {
            for (let attempt = 0; attempt < 30; attempt += 1) {
              try {
                await requestImpl('GET', currentPort, '/api/v1/health')
                return
              } catch (_error) {
                await new Promise((resolve) => setTimeout(resolve, 250))
              }
            }
            throw new Error(`backend_not_ready_on_port_${currentPort}`)
          })(),
          spawnFailed,
        ])
        transition('running')
        return snapshot()
      } catch (error) {
        phase = 'error'
        logFailure('error', 'backend.start', error, {
          port: currentPort,
        })
        throw error
      }
    },

    async stop(): Promise<BackendStatus> {
      if (phase === 'stopped' || phase === 'stopping') {
        return snapshot()
      }

      transition('stopping')
      processHandle?.kill('SIGTERM')
      processHandle = null
      transition('stopped')
      return snapshot()
    },

    async health(): Promise<BackendStatus> {
      await ensureAvailable()
      return snapshot()
    },

    getStatus(): BackendStatus {
      return snapshot()
    },

    async listCapabilities(): Promise<BackendCapabilityDefinition[]> {
      await ensureAvailable()
      try {
        const response = await requestImpl<RawBackendCapabilitiesResponse>(
          'GET',
          currentPort,
          '/api/v1/capabilities',
        )
        return (response.capabilities ?? []).map(normalizeCapabilityDefinition)
      } catch (error) {
        if (!isRecoverableRequestError(error)) {
          logFailure('error', 'backend.list_capabilities', error, {
            port: currentPort,
          })
          throw error
        }
        logFailure('warn', 'backend.list_capabilities', error, {
          operation: 'list_capabilities',
          port: currentPort,
        })
        await restart()
        const response = await requestImpl<RawBackendCapabilitiesResponse>(
          'GET',
          currentPort,
          '/api/v1/capabilities',
        )
        return (response.capabilities ?? []).map(normalizeCapabilityDefinition)
      }
    },

    async invokeCapability<TRequest, TResponse>(
      request: CapabilityRequestEnvelope<TRequest>
    ): Promise<CapabilityResponseEnvelope<TResponse>> {
      await ensureAvailable()
      try {
        return await requestImpl<CapabilityResponseEnvelope<TResponse>>(
          'POST',
          currentPort,
          '/api/v1/capabilities/invoke',
          request,
        )
      } catch (error) {
        if (!isRecoverableRequestError(error)) {
          logFailure('error', 'backend.invoke_capability', error, {
            capability: String(request.capability ?? ''),
            requestId: String(request.requestId ?? ''),
            port: currentPort,
          })
          throw error
        }
        logFailure('warn', 'backend.invoke_capability', error, {
          operation: 'invoke_capability',
          capability: String(request.capability ?? ''),
          requestId: String(request.requestId ?? ''),
          port: currentPort,
        })
        await restart()
        return requestImpl<CapabilityResponseEnvelope<TResponse>>(
          'POST',
          currentPort,
          '/api/v1/capabilities/invoke',
          request,
        )
      }
    },
  }

  return thisSupervisor
}
