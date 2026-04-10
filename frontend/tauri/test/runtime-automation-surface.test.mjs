import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('tauri and sdk runtime no longer expose the removed automation definition surface', async () => {
  const tauriBridgeSource = await readFile(path.join(repoRoot, 'frontend/tauri/runtimeBridge.ts'), 'utf8')
  const desktopBridgeSource = await readFile(path.join(repoRoot, 'frontend/desktop/runtimeBridge.ts'), 'utf8')
  const runtimeSource = await readFile(path.join(repoRoot, 'packages/sdk-runtime/src/createPrestoRuntime.ts'), 'utf8')
  const indexSource = await readFile(path.join(repoRoot, 'packages/sdk-runtime/src/index.ts'), 'utf8')
  const rustRuntimeSource = await readFile(path.join(repoRoot, 'src-tauri/src/runtime.rs'), 'utf8')
  const rustPluginSource = await readFile(path.join(repoRoot, 'src-tauri/src/runtime/plugins.rs'), 'utf8')
  const prepareResourcesSource = await readFile(path.join(repoRoot, 'scripts/prepare-tauri-resources.mjs'), 'utf8')
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'packages/sdk-runtime/package.json'), 'utf8'))

  assert.doesNotMatch(tauriBridgeSource, /automation:\s*\{/)
  assert.doesNotMatch(tauriBridgeSource, /automation\.definition\./)
  assert.doesNotMatch(desktopBridgeSource, /AutomationRuntimeClient/)
  assert.doesNotMatch(desktopBridgeSource, /automation:\s*\{/)
  assert.doesNotMatch(runtimeSource, /automation:\s*AutomationRuntimeClient/)
  assert.doesNotMatch(runtimeSource, /automation:\s*runtime\.automation/)
  assert.doesNotMatch(indexSource, /AutomationRuntimeClient/)
  assert.doesNotMatch(rustRuntimeSource, /automation\.definition\./)
  assert.doesNotMatch(rustRuntimeSource, /AutomationDefinitionRecord/)
  assert.doesNotMatch(rustPluginSource, /list_automation_definitions/)
  assert.doesNotMatch(rustPluginSource, /run_automation_definition/)
  assert.doesNotMatch(rustPluginSource, /load_automation_records/)
  assert.doesNotMatch(prepareResourcesSource, /prepareAutomationResources/)
  assert.doesNotMatch(prepareResourcesSource, /frontend',\s*'automation'/)
  assert.equal(packageJson.exports['./clients/automation'], undefined)
})
