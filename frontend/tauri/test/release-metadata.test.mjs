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

  assert.match(packageJson.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/)
  assert.equal(packageJson.author, 'Luminous Layers')
  assert.equal(packageJson.scripts?.['tauri:prepare:python'], 'node scripts/prepare-tauri-python.mjs')
  assert.equal(packageJson.scripts?.['tauri:prepare:resources'], 'node scripts/prepare-tauri-resources.mjs')
  assert.equal(
    packageJson.scripts?.['tauri:prepare:all'],
    'npm run tauri:build:frontend && npm run tauri:prepare:python && npm run tauri:prepare:resources',
  )
  assert.equal(packageJson.scripts?.['tauri:build:frontend'], 'node scripts/build-tauri-frontend.mjs')
  assert.equal(packageJson.scripts?.['tauri:build:sidecar'], undefined)
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
  assert.match(prepareSource, /async function hasUsableBundledPython\(targetArch\)/)
  assert.match(
    prepareSource,
    /if \(await hasUsableBundledPython\(targetArch\)\) \{\s*await normalizeBundledPython\(pythonRoot\)\s*await pruneBundledPython\(pythonRoot,\s*targetArch\)\s*[\s\S]*await writeRuntimeMetadata\(\)\s*return\s*\}/,
  )
  assert.doesNotMatch(prepareSource, /await rm\(pythonRoot, \{ recursive: true, force: true \} \)\s*await mkdir\(outputRoot, \{ recursive: true \} \)\s*await run\(pythonBin, \['-m', 'venv', '--copies', pythonRoot\]\)/)
})

test('tauri python prep rebuilds runtime per target architecture instead of reusing host-arch site-packages blindly', async () => {
  const prepareSource = await readFile(path.join(repoRoot, 'scripts/prepare-tauri-python.mjs'), 'utf8')

  assert.match(prepareSource, /function resolveTargetArch\(\)/)
  assert.match(prepareSource, /PRESTO_TAURI_TARGET/)
  assert.match(prepareSource, /async function validateBundledPython\(root,\s*targetArch\)/)
  assert.match(prepareSource, /site-packages/)
  assert.match(prepareSource, /lipo', \['-archs'/)
  assert.match(prepareSource, /await validateBundledPython\(pythonRoot,\s*targetArch\)/)
  assert.match(prepareSource, /await runTargetArch\(targetArch,\s*pythonBin,\s*\['-m', 'venv', '--copies', stagingPythonRoot\]\)/)
  assert.match(prepareSource, /await runTargetArch\(targetArch,\s*bundledPip,\s*\['install', '--upgrade', 'pip'\]\)/)
  assert.match(prepareSource, /await runTargetArch\(targetArch,\s*bundledPip,\s*\['install', '--no-cache-dir', '-r', runtimeRequirementsPath\]\)/)
})

test('tauri packaging script configures Finder on a mounted writable DMG before compression', async () => {
  const packageBuildSource = await readFile(path.join(repoRoot, 'scripts/package-tauri-build.mjs'), 'utf8')

  assert.match(packageBuildSource, /await run\('hdiutil', \['create', '-size', writableDmgSize, '-fs', 'HFS\+', '-volname', productName, '-type', 'UDIF'/)
  assert.match(packageBuildSource, /await run\('hdiutil', \['attach', rawDmgPath, '-mountpoint', mountedDmgPath, '-nobrowse', '-noautoopen'\]\)/)
  assert.match(packageBuildSource, /await decorateDmgStagingDir\(mountedDmgPath\)/)
  assert.match(packageBuildSource, /await run\('hdiutil', \['detach', mountedDmgPath\]\)/)
  assert.match(packageBuildSource, /await run\('hdiutil', \['convert', rawDmgPath, '-format', 'UDBZ', '-o', dmgPath\]\)/)
  assert.match(packageBuildSource, /size-report\.json/)
  assert.doesNotMatch(packageBuildSource, /await run\('hdiutil', \['makehybrid'/)
})

test('tauri packaging script includes a one-click quarantine removal command in the DMG', async () => {
  const packageBuildSource = await readFile(path.join(repoRoot, 'scripts/package-tauri-build.mjs'), 'utf8')

  assert.match(packageBuildSource, /const quarantineBypassCommandName = '打不开时运行\.command'/)
  assert.match(packageBuildSource, /async function writeQuarantineBypassCommand\(targetPath\)/)
  assert.match(packageBuildSource, /xattr -dr com\.apple\.quarantine "\/Applications\/Presto\.app"/)
  assert.match(packageBuildSource, /chmod\(targetPath,\s*0o755\)/)
  assert.match(packageBuildSource, /await writeQuarantineBypassCommand\(path\.join\(mountedDmgPath,\s*quarantineBypassCommandName\)\)/)
  assert.match(packageBuildSource, /await run\('hdiutil', \['create'/)
})

test('tauri packaging script lays out a branded DMG Finder window', async () => {
  const packageBuildSource = await readFile(path.join(repoRoot, 'scripts/package-tauri-build.mjs'), 'utf8')

  assert.match(packageBuildSource, /const dmgWindowWidth = 600/)
  assert.match(packageBuildSource, /const dmgWindowHeight = 600/)
  assert.match(packageBuildSource, /const dmgBackgroundHeight = 560/)
  assert.match(packageBuildSource, /async function writeDmgBackground\(backgroundDir\)/)
  assert.match(packageBuildSource, /Hi,Presto/)
  assert.match(packageBuildSource, /拖到 Applications 即可安装/)
  assert.match(packageBuildSource, /x="300" y="400"[\s\S]*无法打开时，运行下方脚本/)
  assert.match(packageBuildSource, /d="M292 246L308 270L292 294"/)
  assert.doesNotMatch(packageBuildSource, /Drag to Applications/)
  assert.match(packageBuildSource, /await run\('qlmanage', \['-t', '-s', String\(dmgWindowWidth\), '-o', backgroundDir, backgroundSvgPath\]\)/)
  assert.match(packageBuildSource, /await run\('sips', \['--cropToHeightWidth', String\(dmgBackgroundHeight\), String\(dmgWindowWidth\), backgroundPngPath\]\)/)
  assert.match(packageBuildSource, /await run\('SetFile', \['-a', 'V', backgroundDir\]\)/)
  assert.match(packageBuildSource, /async function configureDmgFinderWindow\(stagingDir\)/)
  assert.match(packageBuildSource, /set current view of container window of dmgFolder to icon view/)
  assert.match(packageBuildSource, /set toolbar visible of container window of dmgFolder to false/)
  assert.match(packageBuildSource, /set pathbar visible of container window of dmgFolder to false/)
  assert.match(packageBuildSource, /menu item "Hide Tab Bar" of menu "View" of menu bar 1/)
  assert.match(packageBuildSource, /set background picture of iconViewOptions to file ".background:dmg-background.png" of dmgFolder/)
  assert.match(packageBuildSource, /set position of item "\$\{productName\}\.app" of dmgFolder to \{160, 255\}/)
  assert.match(packageBuildSource, /set position of item "Applications" of dmgFolder to \{440, 255\}/)
  assert.match(packageBuildSource, /set position of item "\$\{quarantineBypassCommandName\}" of dmgFolder to \{300, 455\}/)
  assert.match(packageBuildSource, /await decorateDmgStagingDir\(mountedDmgPath\)/)
})

test('tauri packaging script syncs only configured bundle resources into the app bundle before signing', async () => {
  const tauriConfig = JSON.parse(await readFile(path.join(repoRoot, 'src-tauri/tauri.conf.json'), 'utf8'))
  const packageBuildSource = await readFile(path.join(repoRoot, 'scripts/package-tauri-build.mjs'), 'utf8')

  assert.deepEqual(tauriConfig.bundle?.resources, {
    'resources/build/': 'build/',
    'resources/backend/': 'backend/',
    'resources/plugins/': 'plugins/',
  })
  assert.match(packageBuildSource, /async function syncBundledResources\(appBundlePath\)/)
  assert.match(packageBuildSource, /Object\.values\(tauriConfig\.bundle\?\.resources \?\? \{\}\)/)
  assert.match(packageBuildSource, /for \(const resourceName of bundledResourceNames\)/)
  assert.match(packageBuildSource, /const stagedResourcesRoot = path\.join\(repoRoot,\s*'src-tauri',\s*'resources'\)/)
  assert.match(packageBuildSource, /const stagedResourcePath = path\.join\(stagedResourcesRoot,\s*resourceName\)/)
  assert.match(packageBuildSource, /const bundledResourcePath = path\.join\(resourcesRoot,\s*resourceName\)/)
  assert.match(packageBuildSource, /await cp\(stagedResourcePath,\s*bundledResourcePath,\s*\{\s*recursive: true\s*\}\)/)
  assert.match(packageBuildSource, /await syncBundledResources\(appPath\)\s*await run\('node', \['scripts\/inject-macos-app-icon\.mjs', '--app', appPath\]\)/)
  assert.doesNotMatch(packageBuildSource, /'frontend'/)
})

test('package.json no longer exposes Electron build and packaging scripts', async () => {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))

  assert.doesNotMatch(packageJson.scripts?.['test:node'] ?? '', /frontend\/electron\/test/)
  assert.equal(packageJson.scripts?.['stage1:build'], undefined)
  assert.equal(packageJson.scripts?.['stage1:start'], undefined)
  assert.equal(packageJson.scripts?.['package:mac:prepare'], undefined)
  assert.equal(packageJson.scripts?.['package:mac:dmg'], undefined)
  assert.equal(packageJson.scripts?.['package:mac:dmg:arm64'], undefined)
  assert.equal(packageJson.scripts?.['package:mac:dmg:x64'], undefined)
  assert.equal(packageJson.devDependencies?.electron, undefined)
  assert.equal(packageJson.devDependencies?.['electron-builder'], undefined)
  assert.equal(packageJson.main, undefined)
})

test('formal desktop runtime entrypoints no longer depend on Electron-only host files', async () => {
  assert.equal(await exists('frontend/electron'), false)
  assert.equal(await exists('frontend/sidecar'), false)
  assert.equal(await exists('frontend/runtime'), false)
  assert.equal(await exists('frontend/electron/main.mjs'), false)
  assert.equal(await exists('frontend/electron/preload.ts'), false)
  assert.equal(await exists('frontend/electron/build-stage1.mjs'), false)
  assert.equal(await exists('frontend/electron/stage1Paths.mjs'), false)
  assert.equal(await exists('frontend/electron/runtime/registerRuntimeHandlers.mjs'), false)
  assert.equal(await exists('frontend/electron/runtime/smokeHarness.mjs'), false)
})
