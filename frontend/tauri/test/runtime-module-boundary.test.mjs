import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('tauri runtime and renderer plugin host depend on shared runtime modules instead of Electron host entrypoints', async () => {
  const tauriBridgeSource = await readFile(path.join(repoRoot, 'frontend/tauri/runtimeBridge.ts'), 'utf8')
  const desktopBridgeSource = await readFile(path.join(repoRoot, 'frontend/desktop/runtimeBridge.ts'), 'utf8')
  const pluginHostRuntimeSource = await readFile(path.join(repoRoot, 'frontend/host/pluginHostRuntime.ts'), 'utf8')

  assert.doesNotMatch(tauriBridgeSource, /\.\.\/electron\/runtime\/runtimeBridge/)
  assert.match(desktopBridgeSource, /createPrestoRuntime\(/)
  assert.doesNotMatch(pluginHostRuntimeSource, /host-plugin-runtime\/index/)
})

test('tauri runtime root keeps domain state in runtime modules', async () => {
  const runtimeSource = await readFile(path.join(repoRoot, 'src-tauri/src/runtime.rs'), 'utf8')
  const backendSource = await readFile(path.join(repoRoot, 'src-tauri/src/runtime/backend.rs'), 'utf8')
  const mobileSource = await readFile(path.join(repoRoot, 'src-tauri/src/runtime/mobile_progress.rs'), 'utf8')
  const pluginsSource = await readFile(path.join(repoRoot, 'src-tauri/src/runtime/plugins.rs'), 'utf8')

  assert.doesNotMatch(runtimeSource, /struct BackendSupervisorState/)
  assert.doesNotMatch(runtimeSource, /struct MobileProgressState/)
  assert.doesNotMatch(runtimeSource, /struct PluginCandidate/)
  assert.match(backendSource, /struct BackendSupervisorState/)
  assert.match(mobileSource, /struct MobileProgressState/)
  assert.match(pluginsSource, /struct PluginCandidate/)
})
