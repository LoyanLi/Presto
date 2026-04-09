import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('plugin catalog subscribes to daw target changes and refreshes against the updated target', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/desktop/useHostPluginCatalogState.ts'), 'utf8')

  assert.match(source, /const \[pluginDawTarget,\s*setPluginDawTarget\] = useState\(/)
  assert.match(source, /setPluginDawTarget\(preferences\.dawTarget\)/)
  assert.match(source, /}, \[pluginLocale\.resolved,\s*pluginDawTarget\]\)/)
})
