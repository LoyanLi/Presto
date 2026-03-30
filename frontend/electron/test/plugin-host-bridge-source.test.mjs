import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('electron host wires plugin host build through one-shot bootstrap and keeps private bridges off window globals', async () => {
  const buildSource = await readFile(path.join(repoRoot, 'frontend/electron/build-stage1.mjs'), 'utf8')
  const mainSource = await readFile(path.join(repoRoot, 'frontend/electron/main.mjs'), 'utf8')
  const runtimeHandlerSource = await readFile(
    path.join(repoRoot, 'frontend/electron/runtime/registerRuntimeHandlers.mjs'),
    'utf8',
  )
  const preloadSource = await readFile(path.join(repoRoot, 'frontend/electron/preload.ts'), 'utf8')
  const runtimeBridgeSource = await readFile(path.join(repoRoot, 'frontend/electron/runtime/runtimeBridge.ts'), 'utf8')
  const rendererSource = await readFile(path.join(repoRoot, 'frontend/electron/renderer.tsx'), 'utf8')
  const pluginHostRuntimeSource = await readFile(path.join(repoRoot, 'frontend/host/pluginHostRuntime.ts'), 'utf8')

  assert.match(buildSource, /pluginHostService\.ts/)
  assert.match(runtimeHandlerSource, /plugins:list/)
  assert.match(runtimeHandlerSource, /plugins:install-directory/)
  assert.match(runtimeHandlerSource, /plugins:install-zip/)
  assert.match(runtimeHandlerSource, /plugins:uninstall/)
  assert.match(mainSource, /syncOfficialExtensions/)
  assert.match(preloadSource, /takePluginHostBridge/)
  assert.match(preloadSource, /takeRuntime/)
  assert.doesNotMatch(preloadSource, /__PRESTO_PLUGIN_HOST__/)
  assert.doesNotMatch(preloadSource, /__PRESTO_PLUGIN_SANDBOX__/)
  assert.doesNotMatch(preloadSource, /exposeInMainWorld\('presto'/)
  assert.match(runtimeBridgeSource, /setDawTarget:\s*'backend:set-daw-target'/)
  assert.match(runtimeBridgeSource, /setDawTarget:\s*\(target: string\)/)
  assert.match(runtimeBridgeSource, /getDawAdapterSnapshot:\s*'backend:get-daw-adapter-snapshot'/)
  assert.match(runtimeBridgeSource, /getDawAdapterSnapshot:\s*\(\)/)
  assert.match(runtimeBridgeSource, /viewLog:\s*'app:view-log'/)
  assert.match(runtimeBridgeSource, /viewLog:\s*\(\)/)
  assert.match(runtimeHandlerSource, /ipcMain\.handle\('backend:set-daw-target'/)
  assert.match(runtimeHandlerSource, /ipcMain\.handle\('backend:get-daw-adapter-snapshot'/)
  assert.match(runtimeHandlerSource, /ipcMain\.handle\('app:view-log'/)
  assert.match(mainSource, /Console/)
  assert.match(rendererSource, /takePluginHostBridge\(\)/)
  assert.match(rendererSource, /takeRuntime\(\)/)
  assert.doesNotMatch(rendererSource, /window\.presto/)
  assert.doesNotMatch(rendererSource, /__PRESTO_PLUGIN_HOST__/)
  assert.doesNotMatch(pluginHostRuntimeSource, /__PRESTO_PLUGIN_SANDBOX__/)
  assert.doesNotMatch(rendererSource, /listDefinitions\(\)/)
  assert.doesNotMatch(rendererSource, /extensionType:\s*'automation'/)
  assert.match(pluginHostRuntimeSource, /extensionType:\s*plugin\.manifest\.extensionType/)
  assert.match(mainSource, /managedPluginsRoot:\s*path\.join\(app\.getPath\('userData'\),\s*'extensions'\)/)
  assert.match(mainSource, /app\.setName\(DEFAULT_APP_METADATA\.applicationName\)/)
  assert.match(mainSource, /title:\s*'Presto'/)
})
