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
