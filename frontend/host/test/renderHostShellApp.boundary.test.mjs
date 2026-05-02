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

test('renderHostShellApp bootstraps DAW status before mounting the host shell', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/desktop/renderHostShellApp.tsx'), 'utf8')

  assert.match(source, /async function loadInitialDawBootstrap/)
  assert.match(source, /await runtime\.backend\.getDawAdapterSnapshot\(\)/)
  assert.match(source, /await client\.daw\.connection\.getStatus\(\)/)
  assert.match(source, /const initialDawBootstrap = await loadInitialDawBootstrap\(client, runtime\)/)
  assert.match(source, /dawAdapterSnapshot=\{initialDawBootstrap\.snapshot\}/)
  assert.match(source, /initialDawConnectionStatus=\{initialDawBootstrap\.connectionStatus\}/)
  assert.match(source, /createRoot\(container\)\.render\(<App initialDawBootstrap=\{initialDawBootstrap\} \/>\)/)
})
