import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('plugin host runtime forwards tool run metric recording into guarded plugin runtime', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/pluginHostRuntime.ts'), 'utf8')

  assert.match(source, /recordToolRunSuccess\?\(input:/)
  assert.match(source, /recordToolRunSuccess: input\.metricsRecorder\.recordToolRunSuccess/)
})

test('plugin catalog state forwards tool run metric recorder into host run metrics', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/desktop/useHostPluginCatalogState.ts'), 'utf8')

  assert.match(source, /recordToolRunSuccess,/)
  assert.match(source, /recordToolRunSuccess:\s*\(\{\s*jobId,\s*toolKey,\s*label,\s*at\s*\}\)\s*=>/)
  assert.match(source, /recordToolRunSuccess\(\{\s*jobId,\s*toolKey,\s*label,\s*at,\s*\}\)/)
})
