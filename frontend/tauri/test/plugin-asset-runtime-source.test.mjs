import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('tauri plugin loading uses asset URLs and enables asset protocol for installed extensions', async () => {
  const pluginHostRuntimeSource = await readFile(path.join(repoRoot, 'frontend/host/pluginHostRuntime.ts'), 'utf8')
  const pluginHostAssetUrlsSource = await readFile(path.join(repoRoot, 'frontend/host/pluginHostAssetUrls.ts'), 'utf8')
  const tauriConfig = JSON.parse(await readFile(path.join(repoRoot, 'src-tauri/tauri.conf.json'), 'utf8'))

  assert.match(pluginHostRuntimeSource, /toRuntimeModuleUrl/)
  assert.match(pluginHostAssetUrlsSource, /convertFileSrc\(pathValue\)/)
  assert.match(pluginHostAssetUrlsSource, /new URL\(encodeTauriAssetPath\(pathValue\), runtimeAssetUrl\)/)
  assert.equal(tauriConfig.app?.security?.assetProtocol?.enable, true)
  assert.match(JSON.stringify(tauriConfig.app?.security?.assetProtocol?.scope ?? []), /\$APPDATA\/extensions\/\*\*/)
})
