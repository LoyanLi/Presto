import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { request as nodeHttpRequest } from 'node:http'
import { createServer as createNetServer } from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { CapabilityRequestEnvelope, CapabilityResponseEnvelope, DawTarget } from '../../../packages/contracts/src'
import type { BackendLogEntry, BackendStatus } from '../../../packages/sdk-runtime/src/clients/backend.ts'

export interface BackendSupervisor {
  start(): Promise<BackendStatus>
  stop(): Promise<BackendStatus>
  health(): Promise<BackendStatus>
  getStatus(): BackendStatus
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
  currentDir: resolvedCurrentDir = currentDir,
  isPackaged = /(^|[\\/])app\.asar([\\/]|$)/.test(resolvedCurrentDir),
  resourcesPath = process.resourcesPath,
}: {
  currentDir?: string
  isPackaged?: boolean
  resourcesPath?: string
} = {}): string {
  if (isPackaged) {
    return path.resolve(resourcesPath, 'backend/presto')
  }

  return path.resolve(resolvedCurrentDir, '../../../backend/presto')
}

const backendRoot = resolveBackendRoot()

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
  const resolvePythonBin = options.resolvePythonBinImpl ?? resolveBackendPythonBin
  const log = (level: 'info' | 'warn' | 'error', message: string, details?: Record<string, unknown>) => {
    options.onLog?.({
      source: 'backend.supervisor',
      level,
      message,
      details: details ?? null,
    })
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
        throw error
      }
      log('warn', error instanceof Error ? error.message : String(error ?? 'backend_health_check_failed'), {
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
      processHandle = spawnImpl(resolvePythonBin(), ['main_api.py', '--host', '127.0.0.1', '--port', String(currentPort)], {
        cwd: backendRoot,
        env: {
          ...process.env,
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
        lastError = String(chunk).trim() || lastError
        if (lastError) {
          log('error', lastError, {
            operation: 'stderr',
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
          throw error
        }
        lastError = error instanceof Error ? error.message : String(error ?? 'backend_request_failed')
        log('warn', lastError, {
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
