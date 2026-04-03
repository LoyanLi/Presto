import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('tauri host uses invoke bridge and stdio sidecar RPC', async () => {
  const tauriBridgeSource = await readFile(path.join(repoRoot, 'frontend/tauri/runtimeBridge.ts'), 'utf8')
  const desktopBridgeSource = await readFile(path.join(repoRoot, 'frontend/desktop/runtimeBridge.ts'), 'utf8')
  const tauriRendererSource = await readFile(path.join(repoRoot, 'frontend/tauri/renderer.tsx'), 'utf8')
  const sidecarSource = await readFile(path.join(repoRoot, 'frontend/sidecar/main.ts'), 'utf8')
  const rustSource = await readFile(path.join(repoRoot, 'src-tauri/src/main.rs'), 'utf8')
  const cargoToml = await readFile(path.join(repoRoot, 'src-tauri/Cargo.toml'), 'utf8')

  assert.match(tauriBridgeSource, /from '@tauri-apps\/api\/core'/)
  assert.match(tauriBridgeSource, /invoke\(/)
  assert.match(tauriBridgeSource, /createDesktopRuntimeBridge\(/)
  assert.doesNotMatch(tauriBridgeSource, /\.\.\/electron\/runtime\/runtimeBridge/)
  assert.doesNotMatch(tauriBridgeSource, /backend_invoke_capability/)
  assert.doesNotMatch(tauriBridgeSource, /app:get-version|plugins:list|backend:invoke-capability/)
  assert.match(tauriBridgeSource, /app\.version\.get/)
  assert.match(tauriBridgeSource, /backend\.capability\.invoke/)
  assert.match(tauriBridgeSource, /runtime_invoke', \{ operation, args \}/)
  assert.match(desktopBridgeSource, /createPrestoRuntime\(/)
  assert.match(tauriRendererSource, /createTauriRuntimeBridge\(\)/)
  assert.doesNotMatch(tauriRendererSource, /__PRESTO_BOOTSTRAP__/)
  assert.match(sidecarSource, /process\.stdin/)
  assert.match(sidecarSource, /process\.stdout/)
  assert.match(sidecarSource, /JSON\.parse/)
  assert.match(sidecarSource, /JSON\.stringify/)
  assert.doesNotMatch(sidecarSource, /app:get-version|plugins:list|backend:invoke-capability/)
  assert.match(sidecarSource, /backend\.capability\.invoke/)
  assert.match(rustSource, /Command::new/)
  assert.match(rustSource, /stdin/)
  assert.match(rustSource, /stdout/)
  assert.doesNotMatch(rustSource, /backend_invoke_capability/)
  assert.doesNotMatch(rustSource, /app:get-version|plugins:list|backend:invoke-capability/)
  assert.match(rustSource, /app\.version\.get/)
  assert.match(rustSource, /backend\.capability\.invoke/)
  assert.match(rustSource, /"operation": operation/)
  assert.match(cargoToml, /\[package\]/)
  assert.match(cargoToml, /tauri/)
})
