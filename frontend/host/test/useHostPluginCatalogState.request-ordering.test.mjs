import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('plugin catalog refresh guards state commits so stale async requests cannot overwrite newer results', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/desktop/useHostPluginCatalogState.ts'), 'utf8')

  assert.match(source, /useRef\(/)
  assert.match(source, /const requestId = \+\+latestRequestIdRef\.current/)
  assert.match(source, /if\s*\(requestId !== latestRequestIdRef\.current\)\s*\{\s*return\s*\}/)
})
