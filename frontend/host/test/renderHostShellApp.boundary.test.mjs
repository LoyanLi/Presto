import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('renderHostShellApp delegates plugin catalog orchestration to a dedicated hook', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/desktop/renderHostShellApp.tsx'), 'utf8')

  assert.match(source, /from '\.\/useHostPluginCatalogState'/)
  assert.doesNotMatch(source, /const refreshPlugins = async/)
  assert.doesNotMatch(source, /runtime\.plugins\.installFromDirectory\(\)/)
  assert.doesNotMatch(source, /runtime\.plugins\.installFromZip\(\)/)
  assert.doesNotMatch(source, /runtime\.plugins\.setEnabled\(/)
  assert.doesNotMatch(source, /runtime\.plugins\.uninstall\(/)
})
