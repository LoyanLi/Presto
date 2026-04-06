import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { access, readFile } from 'node:fs/promises'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

async function exists(relativePath) {
  try {
    await access(path.join(repoRoot, relativePath))
    return true
  } catch {
    return false
  }
}

test('package.json exposes Presto release metadata through the Tauri build chain', async () => {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))
  const tauriConfig = JSON.parse(await readFile(path.join(repoRoot, 'src-tauri/tauri.conf.json'), 'utf8'))

  assert.equal(packageJson.version, '0.3.2')
  assert.equal(packageJson.author, 'Luminous Layers')
  assert.equal(packageJson.scripts?.['tauri:prepare:python'], 'node scripts/prepare-tauri-python.mjs')
  assert.equal(packageJson.scripts?.['tauri:prepare:resources'], 'node scripts/prepare-tauri-resources.mjs')
  assert.equal(
    packageJson.scripts?.['tauri:prepare:all'],
    'npm run tauri:build:frontend && npm run tauri:build:sidecar && npm run tauri:prepare:python && npm run tauri:prepare:resources',
  )
  assert.equal(packageJson.scripts?.['tauri:build:frontend'], 'node scripts/build-tauri-frontend.mjs')
  assert.equal(packageJson.scripts?.['tauri:build:sidecar'], 'node scripts/build-tauri-sidecar.mjs')
  assert.equal(packageJson.scripts?.['tauri:build'], 'node scripts/package-tauri-build.mjs')
  assert.equal(packageJson.scripts?.['tauri:dev'], 'tauri dev')
  assert.equal(packageJson.scripts?.['tauri:build:arm64'], 'PRESTO_TAURI_TARGET=aarch64-apple-darwin node scripts/package-tauri-build.mjs')
  assert.equal(packageJson.scripts?.['tauri:build:x64'], 'PRESTO_TAURI_TARGET=x86_64-apple-darwin node scripts/package-tauri-build.mjs')
  assert.equal(tauriConfig.productName, 'Presto')
  assert.equal(tauriConfig.identifier, 'com.loyan.presto')
  assert.equal(
    tauriConfig.build?.beforeBuildCommand,
    'npm run tauri:prepare:all',
  )
  assert.equal(
    tauriConfig.build?.beforeDevCommand,
    'npm run tauri:prepare:all',
  )
  assert.deepEqual(tauriConfig.bundle?.targets, ['app', 'dmg'])
  assert.deepEqual(tauriConfig.bundle?.icon, [
    'icons/32x32.png',
    'icons/128x128.png',
    'icons/128x128@2x.png',
    'icons/icon.icns',
  ])
  assert.deepEqual(tauriConfig.bundle?.resources, {
    'resources/build/': 'build/',
    'resources/backend/': 'backend/',
    'resources/plugins/': 'plugins/',
    'resources/frontend/': 'frontend/',
  })
})

test('bundled python metadata tracks runtime requirements only', async () => {
  const runtimeMetadata = JSON.parse(
    await readFile(path.join(repoRoot, 'src-tauri/resources/backend/python-runtime.json'), 'utf8'),
  )
  const runtimeRequirementsFile = await readFile(path.join(repoRoot, 'backend/requirements-runtime.txt'), 'utf8')
  const devRequirementsFile = await readFile(path.join(repoRoot, 'backend/requirements-dev.txt'), 'utf8')

  assert.deepEqual(
    runtimeMetadata.requirements,
    runtimeRequirementsFile
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#')),
  )
  assert.match(devRequirementsFile, /pytest/)
  assert.doesNotMatch(runtimeRequirementsFile, /pytest/)
  assert.doesNotMatch(runtimeRequirementsFile, /flake8/)
})

test('tauri python prep stages a fresh bundled runtime before replacing the existing one', async () => {
  const prepareSource = await readFile(path.join(repoRoot, 'scripts/prepare-tauri-python.mjs'), 'utf8')

  assert.match(prepareSource, /const stagingPythonRoot = path\.join\(outputRoot, 'python\.staging'\)/)
  assert.match(prepareSource, /await rm\(stagingPythonRoot,\s*\{\s*recursive: true,\s*force: true\s*\}\s*\)/)
  assert.match(prepareSource, /await rename\(stagingPythonRoot, pythonRoot\)/)
  assert.match(prepareSource, /async function hasUsableBundledPython\(\)/)
  assert.match(prepareSource, /if \(await hasUsableBundledPython\(\)\) \{\s*await writeRuntimeMetadata\(\)\s*return\s*\}/)
  assert.doesNotMatch(prepareSource, /await rm\(pythonRoot, \{ recursive: true, force: true \} \)\s*await mkdir\(outputRoot, \{ recursive: true \} \)\s*await run\(pythonBin, \['-m', 'venv', '--copies', pythonRoot\]\)/)
})

test('package.json no longer exposes Electron build and packaging scripts', async () => {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))

  assert.equal(packageJson.scripts?.['stage1:build'], undefined)
  assert.equal(packageJson.scripts?.['stage1:start'], undefined)
  assert.equal(packageJson.scripts?.['package:mac:prepare'], undefined)
  assert.equal(packageJson.scripts?.['package:mac:dmg'], undefined)
  assert.equal(packageJson.scripts?.['package:mac:dmg:arm64'], undefined)
  assert.equal(packageJson.scripts?.['package:mac:dmg:x64'], undefined)
  assert.equal(packageJson.devDependencies?.electron, undefined)
  assert.equal(packageJson.devDependencies?.['electron-builder'], undefined)
})

test('formal desktop runtime entrypoints no longer depend on Electron-only host files', async () => {
  assert.equal(await exists('frontend/electron/main.mjs'), false)
  assert.equal(await exists('frontend/electron/preload.ts'), false)
  assert.equal(await exists('frontend/electron/build-stage1.mjs'), false)
  assert.equal(await exists('frontend/electron/stage1Paths.mjs'), false)
  assert.equal(await exists('frontend/electron/runtime/registerRuntimeHandlers.mjs'), false)
  assert.equal(await exists('frontend/electron/runtime/smokeHarness.mjs'), false)
})
