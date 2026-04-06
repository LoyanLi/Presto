import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')
const entry = path.join(repoRoot, 'frontend/runtime/backendSupervisor.ts')

let modulePromise = null

async function loadSupervisorModule() {
  if (!modulePromise) {
    modulePromise = (async () => {
      const outDir = await mkdtemp(path.join(tmpdir(), 'presto-backend-supervisor-test-'))
      const outfile = path.join(outDir, 'backendSupervisor.mjs')
      await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        format: 'esm',
        platform: 'node',
        target: 'node20',
        outfile,
      })
      return import(pathToFileURL(outfile).href)
    })()
  }
  return modulePromise
}

function createFakeProcess() {
  const listeners = new Map()
  return {
    stdout: {
      on(event, handler) {
        listeners.set(`stdout:${event}`, handler)
      },
    },
    stderr: {
      on(event, handler) {
        listeners.set(`stderr:${event}`, handler)
      },
    },
    once(event, handler) {
      listeners.set(event, handler)
    },
    on(event, handler) {
      listeners.set(event, handler)
    },
    kill() {},
    emit(event, ...args) {
      const handler = listeners.get(event)
      if (handler) {
        handler(...args)
      }
    },
    emitStdout(chunk) {
      const handler = listeners.get('stdout:data')
      if (handler) {
        handler(chunk)
      }
    },
    emitStderr(chunk) {
      const handler = listeners.get('stderr:data')
      if (handler) {
        handler(chunk)
      }
    },
  }
}

test('backend supervisor retries invoke after recoverable socket reset', async (t) => {
  const { createBackendSupervisor } = await loadSupervisorModule()
  const requests = []
  const logEntries = []
  let postAttempts = 0
  let healthAttempts = 0

  const supervisor = createBackendSupervisor({
    resolvePortImpl: async () => 18500,
    onLog: (entry) => {
      logEntries.push(entry)
    },
    requestJsonImpl: async (method, port, pathname, body) => {
      requests.push({ method, port, pathname, body })
      if (method === 'GET' && pathname === '/api/v1/health') {
        healthAttempts += 1
        return { ok: true }
      }
      if (method === 'POST' && pathname === '/api/v1/capabilities/invoke') {
        postAttempts += 1
        if (postAttempts === 1) {
          const error = new Error('socket hang up')
          error.code = 'ECONNRESET'
          throw error
        }
        return { success: true, capability: 'system.health', data: { ok: true } }
      }
      throw new Error(`unexpected_request:${method}:${pathname}`)
    },
    spawnImpl: () => createFakeProcess(),
  })

  const response = await supervisor.invokeCapability({
    requestId: 'req-1',
    capability: 'system.health',
    payload: {},
  })

  assert.equal(response.success, true)
  assert.equal(postAttempts, 2)
  assert.ok(healthAttempts >= 2)
  assert.equal(
    logEntries.some(
      (entry) =>
        entry.source === 'backend.supervisor' &&
        entry.level === 'warn' &&
        /socket hang up/i.test(entry.message),
    ),
    true,
  )
  t.after(async () => {
    await supervisor.stop()
  })
})

test('backend supervisor starts backend before first capability invoke', async (t) => {
  const { createBackendSupervisor } = await loadSupervisorModule()
  const requests = []
  let spawnCount = 0

  const supervisor = createBackendSupervisor({
    resolvePortImpl: async () => 18500,
    requestJsonImpl: async (method, port, pathname, body) => {
      requests.push({ method, port, pathname, body })
      if (method === 'GET' && pathname === '/api/v1/health') {
        return { ok: true }
      }
      if (method === 'POST' && pathname === '/api/v1/capabilities/invoke') {
        return { success: true, capability: 'system.health', data: { ok: true } }
      }
      throw new Error(`unexpected_request:${method}:${pathname}`)
    },
    spawnImpl: () => {
      spawnCount += 1
      return createFakeProcess()
    },
  })

  const response = await supervisor.invokeCapability({
    requestId: 'req-2',
    capability: 'system.health',
    payload: {},
  })

  assert.equal(response.success, true)
  assert.equal(spawnCount, 1)
  assert.equal(requests[0].method, 'GET')
  assert.equal(requests[0].pathname, '/api/v1/health')
  t.after(async () => {
    await supervisor.stop()
  })
})

test('backend supervisor lists public capabilities from the backend metadata route', async (t) => {
  const { createBackendSupervisor } = await loadSupervisorModule()
  const requests = []

  const supervisor = createBackendSupervisor({
    resolvePortImpl: async () => 18500,
    requestJsonImpl: async (method, port, pathname, body) => {
      requests.push({ method, port, pathname, body })
      if (method === 'GET' && pathname === '/api/v1/health') {
        return { ok: true }
      }
      if (method === 'GET' && pathname === '/api/v1/capabilities') {
        return {
          capabilities: [
            {
              id: 'track.mute.set',
              version: 1,
              kind: 'command',
              domain: 'track',
              visibility: 'public',
              description: 'Sets mute state for one or more tracks.',
              request_schema: 'TrackMuteSetRequest',
              response_schema: 'TrackToggleSetResponse',
              depends_on: ['daw'],
              supported_daws: ['pro_tools'],
              canonical_source: 'pro_tools',
              field_support: {
                pro_tools: {
                  request_fields: ['trackNames', 'enabled'],
                  response_fields: ['updated', 'trackNames', 'enabled'],
                },
              },
              handler: 'track.mute.set',
              emits_events: [],
            },
          ],
        }
      }
      throw new Error(`unexpected_request:${method}:${pathname}`)
    },
    spawnImpl: () => createFakeProcess(),
  })

  const capabilities = await supervisor.listCapabilities()

  assert.deepEqual(capabilities, [
    {
      id: 'track.mute.set',
      version: 1,
      kind: 'command',
      domain: 'track',
      visibility: 'public',
      description: 'Sets mute state for one or more tracks.',
      requestSchema: 'TrackMuteSetRequest',
      responseSchema: 'TrackToggleSetResponse',
      dependsOn: ['daw'],
      supportedDaws: ['pro_tools'],
      canonicalSource: 'pro_tools',
      fieldSupport: {
        pro_tools: {
          requestFields: ['trackNames', 'enabled'],
          responseFields: ['updated', 'trackNames', 'enabled'],
        },
      },
      handler: 'track.mute.set',
      emitsEvents: [],
    },
  ])
  assert.equal(requests[0].method, 'GET')
  assert.equal(requests[0].pathname, '/api/v1/health')
  assert.equal(requests[1].method, 'GET')
  assert.equal(requests[1].pathname, '/api/v1/capabilities')
  t.after(async () => {
    await supervisor.stop()
  })
})

test('backend supervisor uses an alternate port when the default port is already occupied', async (t) => {
  const { createBackendSupervisor } = await loadSupervisorModule()
  const requests = []
  const spawnCalls = []

  const supervisor = createBackendSupervisor({
    resolvePortImpl: async () => 19500,
    requestJsonImpl: async (method, port, pathname, body) => {
      requests.push({ method, port, pathname, body })
      if (port !== 19500) {
        throw new Error(`unexpected_port:${port}`)
      }
      if (method === 'GET' && pathname === '/api/v1/health') {
        return { ok: true }
      }
      if (method === 'POST' && pathname === '/api/v1/capabilities/invoke') {
        return { success: true, capability: 'system.health', data: { ok: true } }
      }
      throw new Error(`unexpected_request:${method}:${pathname}`)
    },
    spawnImpl: (command, args, options) => {
      spawnCalls.push({ command, args, options })
      return createFakeProcess()
    },
  })

  const response = await supervisor.invokeCapability({
    requestId: 'req-alt-port',
    capability: 'system.health',
    payload: {},
  })

  assert.equal(response.success, true)
  assert.equal(spawnCalls.length, 1)
  assert.match(String(spawnCalls[0]?.args?.join(' ')), /--port 19500/)
  assert.equal(requests[0].port, 19500)
  assert.equal(supervisor.getStatus().port, 19500)
  t.after(async () => {
    await supervisor.stop()
  })
})

test('backend supervisor uses the resolved python binary when starting the backend', async (t) => {
  const { createBackendSupervisor } = await loadSupervisorModule()
  const spawnCalls = []

  const supervisor = createBackendSupervisor({
    resolvePortImpl: async () => 18500,
    resolvePythonBinImpl: () => '/usr/local/bin/python3',
    requestJsonImpl: async (method, _port, pathname, _body) => {
      if (method === 'GET' && pathname === '/api/v1/health') {
        return { ok: true }
      }
      if (method === 'POST' && pathname === '/api/v1/capabilities/invoke') {
        return { success: true, capability: 'system.health', data: { ok: true } }
      }
      throw new Error(`unexpected_request:${method}:${pathname}`)
    },
    spawnImpl: (command, args, options) => {
      spawnCalls.push({ command, args, options })
      return createFakeProcess()
    },
  })

  const response = await supervisor.invokeCapability({
    requestId: 'req-python-bin',
    capability: 'system.health',
    payload: {},
  })

  assert.equal(response.success, true)
  assert.equal(spawnCalls.length, 1)
  assert.equal(spawnCalls[0]?.command, '/usr/local/bin/python3')
  assert.deepEqual(spawnCalls[0]?.args, ['-m', 'presto.main_api', '--host', '127.0.0.1', '--port', '18500'])
  assert.equal(path.basename(String(spawnCalls[0]?.options?.cwd ?? '')), 'backend')
  assert.doesNotMatch(String(spawnCalls[0]?.options?.cwd ?? ''), /backend\/presto$/)
  t.after(async () => {
    await supervisor.stop()
  })
})

test('backend supervisor prefers the packaged python runtime when resources are available', async (t) => {
  const { createBackendSupervisor } = await loadSupervisorModule()
  const previousResourcesDir = process.env.PRESTO_RESOURCES_DIR
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'presto-packaged-python-'))
  const bundledPython = path.join(tempRoot, 'backend', 'python', 'bin', 'python3')
  const spawnCalls = []

  try {
    process.env.PRESTO_RESOURCES_DIR = tempRoot

    const supervisor = createBackendSupervisor({
      resolvePortImpl: async () => 18500,
      resolvePythonBinImpl: () => '/usr/local/bin/python3',
      requestJsonImpl: async (method, _port, pathname, _body) => {
        if (method === 'GET' && pathname === '/api/v1/health') {
          return { ok: true }
        }
        if (method === 'POST' && pathname === '/api/v1/capabilities/invoke') {
          return { success: true, capability: 'system.health', data: { ok: true } }
        }
        throw new Error(`unexpected_request:${method}:${pathname}`)
      },
      spawnImpl: (command, args, options) => {
        spawnCalls.push({ command, args, options })
        return createFakeProcess()
      },
    })

    await import('node:fs/promises').then(({ mkdir, writeFile }) =>
      mkdir(path.dirname(bundledPython), { recursive: true }).then(() => writeFile(bundledPython, '')))

    const response = await supervisor.invokeCapability({
      requestId: 'req-packaged-python-bin',
      capability: 'system.health',
      payload: {},
    })

    assert.equal(response.success, true)
    assert.equal(spawnCalls.length, 1)
    assert.equal(spawnCalls[0]?.command, bundledPython)

    await supervisor.stop()
  } finally {
    if (previousResourcesDir === undefined) {
      delete process.env.PRESTO_RESOURCES_DIR
    } else {
      process.env.PRESTO_RESOURCES_DIR = previousResourcesDir
    }
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test('backend supervisor records stderr output as an error log entry', async (t) => {
  const { createBackendSupervisor } = await loadSupervisorModule()
  const logEntries = []
  let fakeProcess = null

  const supervisor = createBackendSupervisor({
    resolvePortImpl: async () => 18500,
    onLog: (entry) => {
      logEntries.push(entry)
    },
    requestJsonImpl: async (method, _port, pathname, _body) => {
      if (method === 'GET' && pathname === '/api/v1/health') {
        return { ok: true }
      }
      if (method === 'POST' && pathname === '/api/v1/capabilities/invoke') {
        return { success: true, capability: 'system.health', data: { ok: true } }
      }
      throw new Error(`unexpected_request:${method}:${pathname}`)
    },
    spawnImpl: () => {
      fakeProcess = createFakeProcess()
      return fakeProcess
    },
  })

  await supervisor.start()
  fakeProcess.emitStderr('PT_VERSION_UNSUPPORTED\n')

  assert.equal(
    logEntries.some(
      (entry) =>
        entry.source === 'backend.supervisor' &&
        entry.level === 'error' &&
        entry.message === 'backend.stderr PT_VERSION_UNSUPPORTED',
    ),
    true,
  )

  t.after(async () => {
    await supervisor.stop()
  })
})

test('backend supervisor records startup failures before surfacing them', async () => {
  const { createBackendSupervisor } = await loadSupervisorModule()
  const logEntries = []

  const supervisor = createBackendSupervisor({
    resolvePortImpl: async () => 18500,
    onLog: (entry) => {
      logEntries.push(entry)
    },
    requestJsonImpl: async () => {
      const error = new Error('connect ECONNREFUSED 127.0.0.1:18500')
      error.code = 'ECONNREFUSED'
      throw error
    },
    spawnImpl: () => createFakeProcess(),
  })

  await assert.rejects(() => supervisor.start(), /backend_not_ready_on_port_18500/)
  assert.equal(
    logEntries.some(
      (entry) =>
        entry.source === 'backend.supervisor' &&
        entry.level === 'error' &&
        entry.message === 'backend.start backend_not_ready_on_port_18500',
    ),
    true,
  )
})

test('backend supervisor resolves backend root when the supervisor is created, not at module load', async (t) => {
  const { createBackendSupervisor } = await loadSupervisorModule()
  const previousBackendRoot = process.env.PRESTO_BACKEND_ROOT
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'presto-backend-root-'))
  const explicitBackendRoot = path.join(tempRoot, 'backend', 'presto')
  const expectedWorkingDir = path.join(tempRoot, 'backend')
  const spawnCalls = []

  let supervisor = null
  try {
    process.env.PRESTO_BACKEND_ROOT = explicitBackendRoot

    supervisor = createBackendSupervisor({
      resolvePortImpl: async () => 18500,
      resolvePythonBinImpl: () => '/usr/local/bin/python3',
      requestJsonImpl: async (method, _port, pathname, _body) => {
        if (method === 'GET' && pathname === '/api/v1/health') {
          return { ok: true }
        }
        if (method === 'POST' && pathname === '/api/v1/capabilities/invoke') {
          return { success: true, capability: 'system.health', data: { ok: true } }
        }
        throw new Error(`unexpected_request:${method}:${pathname}`)
      },
      spawnImpl: (command, args, options) => {
        spawnCalls.push({ command, args, options })
        return createFakeProcess()
      },
    })

    const response = await supervisor.invokeCapability({
      requestId: 'req-dynamic-backend-root',
      capability: 'system.health',
      payload: {},
    })

    assert.equal(response.success, true)
    assert.equal(spawnCalls.length, 1)
    assert.equal(spawnCalls[0]?.options?.cwd, expectedWorkingDir)
  } finally {
    await supervisor?.stop()
    if (previousBackendRoot === undefined) {
      delete process.env.PRESTO_BACKEND_ROOT
    } else {
      process.env.PRESTO_BACKEND_ROOT = previousBackendRoot
    }
    await rm(tempRoot, { recursive: true, force: true })
  }
})

test('resolveBackendRoot points to unpacked backend in packaged mode', async () => {
  const { resolveBackendRoot } = await loadSupervisorModule()

  assert.equal(
    resolveBackendRoot({
      currentDir: '/tmp/Presto.app/Contents/Resources/app.asar/build/stage1/electron',
      isPackaged: true,
      resourcesPath: '/tmp/Presto.app/Contents/Resources',
    }),
    '/tmp/Presto.app/Contents/Resources/backend/presto',
  )
})

test('resolveBackendRoot points to repo backend in development mode', async () => {
  const { resolveBackendRoot } = await loadSupervisorModule()

  assert.equal(
    resolveBackendRoot({
      currentDir: '/worktree/build/stage1/electron',
      isPackaged: false,
      resourcesPath: '/ignored',
    }),
    '/worktree/backend/presto',
  )
})

test('resolveBackendRoot prefers an explicit backend root for sidecar packaging', async () => {
  const { resolveBackendRoot } = await loadSupervisorModule()

  assert.equal(
    resolveBackendRoot({
      explicitBackendRoot: '/Applications/Presto.app/Contents/Resources/backend/presto',
      currentDir: '/Applications/Presto.app/Contents/Resources/sidecar',
      isPackaged: false,
      resourcesPath: '/ignored',
    }),
    '/Applications/Presto.app/Contents/Resources/backend/presto',
  )
})
