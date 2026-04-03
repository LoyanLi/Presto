import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')
const entry = path.join(repoRoot, 'frontend/runtime/appLogStore.mjs')

test('app log store appends entries into a stable current log file', async () => {
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

  assert.match(currentLogPath, /current\.log$/)
  assert.match(raw, /\[error\] \[backend\.invoke\] backend_invoke_capability_failed/)
  assert.match(raw, /"capability": "system\.health"/)

  await rm(sandbox, { recursive: true, force: true })
})
