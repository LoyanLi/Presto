import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('useDawStatusPolling reads session name from daw.connection.getStatus without calling session.getInfo', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/hooks/useDawStatusPolling.ts'), 'utf8')

  assert.match(source, /await developerPresto\.daw\.connection\.getStatus\(\)/)
  assert.match(source, /status\.sessionName \?\? ''/)
  assert.doesNotMatch(source, /developerPresto\?\.session/)
  assert.doesNotMatch(source, /developerPresto\.session\.getInfo/)
})

test('useDawStatusPolling models DAW status as connected, disconnected, or unknown instead of forcing probe failures into disconnected', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/hooks/useDawStatusPolling.ts'), 'utf8')

  assert.match(source, /export type HostDawConnectionState = 'connected' \| 'disconnected' \| 'unknown'/)
  assert.match(source, /status:\s*'unknown'/)
  assert.match(source, /status:\s*current\.status/)
  assert.doesNotMatch(source, /connected:\s*false,\s*[\s\S]*statusLabel:\s*translateHost\(resolvedLocale, 'general\.disconnected'\)/)
})
