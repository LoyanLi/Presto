import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('root package.json is the single manual version source for frontend and backend metadata', async () => {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))
  const runtimeBridgeSource = await readFile(path.join(repoRoot, 'frontend/tauri/runtimeBridge.ts'), 'utf8')
  const backendMainSource = await readFile(path.join(repoRoot, 'backend/presto/main_api.py'), 'utf8')

  assert.equal(packageJson.scripts?.['version:sync'], 'node scripts/sync-version.mjs')
  assert.match(runtimeBridgeSource, /import\s*\{\s*PRESTO_VERSION\s*\}\s*from '@presto\/contracts'/)
  assert.match(runtimeBridgeSource, /clientVersion:\s*PRESTO_VERSION/)
  assert.match(backendMainSource, /from presto\.version import VERSION/)
  assert.match(backendMainSource, /FastAPI\(title="Presto Backend API", version=VERSION\)/)
  assert.doesNotMatch(runtimeBridgeSource, /clientVersion:\s*'0\.3\.5'/)
  assert.doesNotMatch(backendMainSource, /version="0\.3\.5"/)
})
