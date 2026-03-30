import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('package.json exposes Presto 0.3.0-alpha.1 release metadata', async () => {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))
  const buildStage1Source = await readFile(path.join(repoRoot, 'frontend/electron/build-stage1.mjs'), 'utf8')

  assert.equal(packageJson.version, '0.3.0-alpha.1')
  assert.equal(packageJson.author, 'Luminous Layers')
  assert.equal(packageJson.build?.productName, 'Presto')
  assert.equal(packageJson.build?.appId, 'com.loyan.presto')
  assert.equal(packageJson.build?.mac?.icon, 'frontend/build/App.icon')
  assert.match(buildStage1Source, /'assets', 'App\.icon'/)
  assert.match(buildStage1Source, /frontend', 'build'/)
  assert.match(buildStage1Source, /cp\(/)
})

test('electron main wires about metadata, app icon root, and metadata-backed app version', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/electron/main.mjs'), 'utf8')
  const runtimeHandlersSource = await readFile(
    path.join(repoRoot, 'frontend/electron/runtime/registerRuntimeHandlers.mjs'),
    'utf8',
  )
  const adapterSource = await readFile(
    path.join(repoRoot, 'backend/import/presto/integrations/daw/protools_adapter.py'),
    'utf8',
  )

  assert.match(source, /setAboutPanelOptions\(/)
  assert.doesNotMatch(source, /app\.dock\.setIcon\(/)
  assert.doesNotMatch(source, /nativeImage/)
  assert.match(runtimeHandlersSource, /ipcMain\.handle\('app:get-version', async \(\) => \(await loadAppMetadata\(\)\)\.version\)/)
  assert.match(runtimeHandlersSource, /app:get-latest-release/)
  assert.match(source, /GITHUB_RELEASES_REPO = process\.env\.PRESTO_GITHUB_REPO \|\| 'LoyanLi\/Presto'/)
  assert.match(source, /api\.github\.com\/repos\/\$\{GITHUB_RELEASES_REPO\}\/releases\/latest/)
  assert.match(adapterSource, /company_name: str = "Luminous Layers"/)
})

test('package.json defines split mac installer packaging with minimal file inputs', async () => {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))
  const buildStage1Source = await readFile(path.join(repoRoot, 'frontend/electron/build-stage1.mjs'), 'utf8')

  assert.equal(
    packageJson.scripts?.['package:mac:prepare'],
    'npm run sync:icon && PRESTO_STAGE1_SOURCEMAP=0 PRESTO_STAGE1_MINIFY=1 npm run stage1:build',
  )
  assert.equal(packageJson.scripts?.['sync:icon'], 'bash scripts/prepare_icon.sh')
  assert.equal(packageJson.scripts?.['package:mac:dmg:arm64'], 'electron-builder --mac dmg --arm64 -c.mac.identity=null')
  assert.equal(packageJson.scripts?.['package:mac:dmg:x64'], 'electron-builder --mac dmg --x64 -c.mac.identity=null')
  assert.equal(
    packageJson.scripts?.['package:mac:dmg'],
    'npm run package:mac:prepare && npm run package:mac:dmg:arm64 && npm run package:mac:dmg:x64',
  )
  assert.equal(packageJson.build?.asar, true)
  assert.equal(packageJson.dependencies?.electron, undefined)
  assert.equal(packageJson.devDependencies?.electron, '^37.0.0')
  assert.equal(packageJson.devDependencies?.esbuild, '^0.25.0')
  assert.deepEqual(packageJson.build?.files, [
    'package.json',
    'frontend/electron/**',
    'frontend/build/**',
    'frontend/host/**',
    'frontend/ui/**',
    'backend/**',
    'host-plugin-runtime/**',
    'packages/**',
    'plugins/**',
    'assets/**',
    '!**/test{,s}/**',
    '!**/*.test.*',
    '!**/__pycache__/**',
    '!**/.pytest_cache/**',
    '!**/*.map',
    '!docs/**',
    '!scripts/**',
    '!node_modules/.cache/**',
  ])
  assert.deepEqual(packageJson.build?.extraResources, [
    {
      from: 'backend',
      to: 'backend',
    },
  ])
  assert.equal(packageJson.build?.directories?.output, 'release')
  assert.match(buildStage1Source, /const buildForPackaging = process\.env\.PRESTO_STAGE1_MINIFY === '1'/)
  assert.match(buildStage1Source, /const sourcemap = process\.env\.PRESTO_STAGE1_SOURCEMAP === '0' \? false : 'inline'/)
})
