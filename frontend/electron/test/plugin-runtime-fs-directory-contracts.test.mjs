import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('plugin runtime contract and guards expose directory fs services and shell open-path for plugin workflows', async () => {
  const runtimeContract = await readFile(path.join(repoRoot, 'packages/contracts/src/plugins/runtime.ts'), 'utf8')
  const runtimeGuard = await readFile(path.join(repoRoot, 'host-plugin-runtime/src/permissions/guardRuntimeAccess.ts'), 'utf8')
  const discoverySource = await readFile(path.join(repoRoot, 'host-plugin-runtime/src/discovery/discoverPlugins.ts'), 'utf8')
  const mainSource = await readFile(path.join(repoRoot, 'frontend/electron/main.mjs'), 'utf8')

  assert.match(runtimeContract, /'fs\.readdir'/)
  assert.match(runtimeContract, /'fs\.stat'/)
  assert.match(runtimeContract, /'fs\.getHomePath'/)
  assert.match(runtimeContract, /'shell\.openPath'/)
  assert.match(runtimeContract, /readdir\(path: string\): Promise<string\[\]>/)
  assert.match(runtimeContract, /stat\(path: string\): Promise<\{ isFile: boolean; isDirectory: boolean \} \| null>/)
  assert.match(runtimeContract, /getHomePath\(\): Promise<string>/)
  assert.match(runtimeContract, /openPath\(path: string\): Promise<string>/)
  assert.match(runtimeGuard, /'fs\.readdir'/)
  assert.match(runtimeGuard, /'fs\.stat'/)
  assert.match(runtimeGuard, /'fs\.getHomePath'/)
  assert.match(runtimeGuard, /'shell\.openPath'/)
  assert.match(discoverySource, /'fs\.readdir'/)
  assert.match(discoverySource, /'fs\.stat'/)
  assert.match(discoverySource, /'shell\.openPath'/)
  assert.match(mainSource, /ipcMain\.handle\('shell:open-path'/)
  assert.match(mainSource, /ipcMain\.handle\('shell:open-external'/)
})
