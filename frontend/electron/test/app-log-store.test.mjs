import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')
const entry = path.join(repoRoot, 'frontend/runtime/appLogStore.mjs')

test('app log store writes entries into a session-scoped log file', async () => {
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-app-log-store-'))
  const { createAppLogStore } = await import(pathToFileURL(entry).href)
  const store = createAppLogStore({ logDir: sandbox })

  await store.append({
    source: 'backend.invoke',
    level: 'error',
    message: 'backend_invoke_capability_failed',
    details: {
      capability: 'system.health',
    },
  })

  const currentLogPath = store.getCurrentLogPath()
  const raw = await readFile(currentLogPath, 'utf8')
  const files = await readdir(sandbox)

  assert.match(path.basename(currentLogPath), /^presto-\d{4}-\d{2}-\d{2}T.+\.log$/)
  assert.equal(files.includes('current.log'), false)
  assert.match(raw, /\[error\] \[backend\.invoke\] backend_invoke_capability_failed/)
  assert.match(raw, /\{"capability":"system\.health"\}/)

  await rm(sandbox, { recursive: true, force: true })
})

test('app log store keeps the primary error cause on the summary line', async () => {
  const sandbox = await mkdtemp(path.join(tmpdir(), 'presto-app-log-store-'))
  const { createAppLogStore } = await import(pathToFileURL(entry).href)
  const store = createAppLogStore({ logDir: sandbox })

  await store.append({
    source: 'sidecar.rpc',
    level: 'error',
    message: 'backend.capability.invoke unsupported_operation',
    details: {
      operation: 'backend.capability.invoke',
      message: 'unsupported_operation',
      channel: 'backend.capability.invoke',
    },
  })

  const raw = await readFile(store.getCurrentLogPath(), 'utf8')

  assert.match(raw, /\[error\] \[sidecar\.rpc\] backend\.capability\.invoke unsupported_operation/)
  assert.doesNotMatch(raw, /\n\{\n/)
  assert.match(raw, /\{"channel":"backend\.capability\.invoke"\}/)

  await rm(sandbox, { recursive: true, force: true })
})
