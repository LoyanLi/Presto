import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')
const entry = path.join(repoRoot, 'frontend/electron/runtime/backendSupervisor.ts')

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
    stdout: { on() {} },
    stderr: { on() {} },
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
  t.after(async () => {
    await supervisor.stop()
  })
})

test('resolveBackendRoot points to unpacked backend in packaged mode', async () => {
  const { resolveBackendRoot } = await loadSupervisorModule()

  assert.equal(
    resolveBackendRoot({
      currentDir: '/tmp/Presto.app/Contents/Resources/app.asar/frontend/electron/.stage1',
      isPackaged: true,
      resourcesPath: '/tmp/Presto.app/Contents/Resources',
    }),
    '/tmp/Presto.app/Contents/Resources/backend/import/presto',
  )
})

test('resolveBackendRoot points to repo backend in development mode', async () => {
  const { resolveBackendRoot } = await loadSupervisorModule()

  assert.equal(
    resolveBackendRoot({
      currentDir: '/worktree/frontend/electron/.stage1',
      isPackaged: false,
      resourcesPath: '/ignored',
    }),
    '/worktree/backend/import/presto',
  )
})
