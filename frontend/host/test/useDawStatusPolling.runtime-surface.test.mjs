import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('useDawStatusPolling reads session info from the canonical presto session client surface', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/hooks/useDawStatusPolling.ts'), 'utf8')

  assert.match(source, /developerPresto\?\.session/)
  assert.match(source, /typeof developerPresto\.session\.getInfo === 'function'/)
  assert.match(source, /await developerPresto\.session\.getInfo\(\)/)
  assert.doesNotMatch(source, /developerPresto\.daw\.session/)
})
