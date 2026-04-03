import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { access } from 'node:fs/promises'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

async function exists(relativePath) {
  try {
    await access(path.join(repoRoot, relativePath))
    return true
  } catch {
    return false
  }
}

test('prepared tauri runtime resources keep only packaged backend, plugin, and automation files', async () => {
  const backendMain = 'build/runtime-resources/backend/presto/main_api.py'
  const backendTests = 'build/runtime-resources/backend/presto/tests'
  const backendCache = 'build/runtime-resources/backend/presto/__pycache__'
  const pluginManifest = 'build/runtime-resources/plugins/official/import-workflow/manifest.json'
  const pluginDist = 'build/runtime-resources/plugins/official/import-workflow/dist/entry.mjs'
  const pluginTests = 'build/runtime-resources/plugins/official/import-workflow/test'
  const automationDefinition = 'build/runtime-resources/frontend/runtime/automation/definitions/splitStereoToMono.json'

  assert.equal(await exists(backendMain), true)
  assert.equal(await exists(pluginManifest), true)
  assert.equal(await exists(pluginDist), true)
  assert.equal(await exists(automationDefinition), true)
  assert.equal(await exists(backendTests), false)
  assert.equal(await exists(backendCache), false)
  assert.equal(await exists(pluginTests), false)
})
