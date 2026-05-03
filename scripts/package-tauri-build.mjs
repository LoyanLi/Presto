import { chmod, cp, mkdir, mkdtemp, readFile, readdir, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..')
const targetTriple = process.env.PRESTO_TAURI_TARGET?.trim() || (process.arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin')
const rustToolchainRoot = path.join(os.homedir(), '.rustup', 'toolchains', 'stable-aarch64-apple-darwin', 'bin')
const rustupCargoPath = path.join(rustToolchainRoot, 'cargo')
const rustupRustcPath = path.join(rustToolchainRoot, 'rustc')

function resolveArtifactArch(target) {
  if (target === 'aarch64-apple-darwin') {
    return 'arm64'
  }
  if (target === 'x86_64-apple-darwin') {
    return 'x64'
  }
  throw new Error(`unsupported_tauri_target:${target}`)
}

function resolveRustToolchainEnv() {
  if (!existsSync(rustupCargoPath) || !existsSync(rustupRustcPath)) {
    return {}
  }

  return {
    CARGO: rustupCargoPath,
    RUSTC: rustupRustcPath,
  }
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repoRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        ...resolveRustToolchainEnv(),
        PRESTO_TAURI_TARGET: targetTriple,
      },
      ...options,
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} exited with code ${code ?? 'unknown'}`))
    })
  })
}

function escapeAppleScriptText(value) {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"')
}

const tauriConfig = JSON.parse(await readFile(path.join(repoRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'))
const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))
const productName = tauriConfig.productName
const version = packageJson.version
const artifactArch = resolveArtifactArch(targetTriple)
const stagedResourcesRoot = path.join(repoRoot, 'src-tauri', 'resources')
const bundledResourceNames = Array.from(
  new Set(
    Object.values(tauriConfig.bundle?.resources ?? {})
      .map((resourcePath) => resourcePath.replace(/\/$/, ''))
      .filter((resourcePath) => resourcePath.length > 0),
  ),
)
const bundleRoot = path.join(repoRoot, 'src-tauri', 'target', targetTriple, 'release', 'bundle')
const appPath = path.join(bundleRoot, 'macos', `${productName}.app`)
const dmgDir = path.join(bundleRoot, 'dmg')
const dmgPath = path.join(dmgDir, `${productName}_${version}_${artifactArch}.dmg`)
const rawDmgPath = path.join(dmgDir, `${productName}_${version}_${artifactArch}.raw.dmg`)
const releaseRoot = path.join(repoRoot, 'release', 'tauri', artifactArch)
const releaseAppPath = path.join(releaseRoot, `${productName}.app`)
const releaseDmgPath = path.join(releaseRoot, `${productName}_${version}_${artifactArch}.dmg`)
const releaseSizeReportPath = path.join(releaseRoot, 'size-report.json')
const quarantineBypassCommandName = '打不开时运行.command'
const writableDmgSize = '256m'
const dmgWindowWidth = 600
const dmgWindowHeight = 600
const dmgBackgroundHeight = 560

async function measurePathSize(targetPath) {
  const targetStat = await stat(targetPath)
  if (!targetStat.isDirectory()) {
    return targetStat.size
  }

  const entries = await readdir(targetPath, { withFileTypes: true })
  let total = 0

  for (const entry of entries) {
    total += await measurePathSize(path.join(targetPath, entry.name))
  }

  return total
}

async function measureChildSizes(targetPath) {
  const entries = await readdir(targetPath, { withFileTypes: true })
  const sizes = []

  for (const entry of entries) {
    const childPath = path.join(targetPath, entry.name)
    sizes.push({
      name: entry.name,
      bytes: await measurePathSize(childPath),
    })
  }

  return sizes.sort((left, right) => right.bytes - left.bytes)
}

async function syncBundledResources(appBundlePath) {
  const resourcesRoot = path.join(appBundlePath, 'Contents', 'Resources')

  for (const resourceName of bundledResourceNames) {
    const stagedResourcePath = path.join(stagedResourcesRoot, resourceName)
    const bundledResourcePath = path.join(resourcesRoot, resourceName)

    await rm(bundledResourcePath, { recursive: true, force: true })
    await cp(stagedResourcePath, bundledResourcePath, { recursive: true })
  }
}

async function writeQuarantineBypassCommand(targetPath) {
  const command = `#!/bin/bash
set -euo pipefail

APP_PATH="/Applications/Presto.app"

if [ ! -d "$APP_PATH" ]; then
  echo "Presto.app 不在 /Applications。请先把 Presto.app 拖到 Applications 后再运行本脚本。"
  read -r -p "按回车退出..."
  exit 1
fi

xattr -dr com.apple.quarantine "/Applications/Presto.app"
echo "已跳过 Presto.app 的 macOS 安全性检查。"
read -r -p "按回车退出..."
`

  await writeFile(targetPath, command, 'utf8')
  await chmod(targetPath, 0o755)
}

async function writeDmgBackground(backgroundDir) {
  await mkdir(backgroundDir, { recursive: true })

  const backgroundSvgPath = path.join(backgroundDir, 'dmg-background.svg')
  const generatedPngPath = path.join(backgroundDir, 'dmg-background.svg.png')
  const backgroundPngPath = path.join(backgroundDir, 'dmg-background.png')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${dmgWindowWidth}" height="${dmgBackgroundHeight}" viewBox="0 0 ${dmgWindowWidth} ${dmgBackgroundHeight}">
  <defs>
    <filter id="textShadow" x="-10%" y="-40%" width="120%" height="180%">
      <feDropShadow dx="0" dy="1" stdDeviation="0.8" flood-color="#ffffff" flood-opacity="0.9"/>
    </filter>
  </defs>
  <rect width="${dmgWindowWidth}" height="${dmgBackgroundHeight}" fill="#ffffff"/>
  <text x="300" y="92" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" font-size="34" font-weight="400" fill="#1d1d1f" filter="url(#textShadow)">Hi,Presto</text>
  <text x="300" y="134" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" font-size="19" font-weight="600" fill="#8e8e93">拖到 Applications 即可安装</text>
  <path d="M292 246L308 270L292 294" fill="none" stroke="#707070" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="300" y="400" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif" font-size="12" font-weight="600" fill="#2f2f31">无法打开时，运行下方脚本</text>
</svg>
`

  await writeFile(backgroundSvgPath, svg, 'utf8')
  await rm(generatedPngPath, { force: true })
  await rm(backgroundPngPath, { force: true })
  await run('qlmanage', ['-t', '-s', String(dmgWindowWidth), '-o', backgroundDir, backgroundSvgPath])
  await rename(generatedPngPath, backgroundPngPath)
  await run('sips', ['--cropToHeightWidth', String(dmgBackgroundHeight), String(dmgWindowWidth), backgroundPngPath])
  await rm(backgroundSvgPath, { force: true })
}

async function configureDmgFinderWindow(stagingDir) {
  const appleScript = `
tell application "Finder"
  set dmgFolder to POSIX file "${escapeAppleScriptText(stagingDir)}" as alias
  open dmgFolder
  delay 1
  activate
  set dmgWindow to front window
  set target of dmgWindow to dmgFolder
  set current view of dmgWindow to icon view
  set toolbar visible of dmgWindow to false
  set statusbar visible of dmgWindow to false
  set pathbar visible of dmgWindow to false
end tell
tell application "System Events"
  tell process "Finder"
    if exists menu item "Hide Tab Bar" of menu "View" of menu bar 1 then
      click menu item "Hide Tab Bar" of menu "View" of menu bar 1
    end if
  end tell
end tell
tell application "Finder"
  set current view of container window of dmgFolder to icon view
  set bounds of container window of dmgFolder to {120, 120, ${120 + dmgWindowWidth}, ${120 + dmgWindowHeight}}
  set iconViewOptions to icon view options of container window of dmgFolder
  set arrangement of iconViewOptions to not arranged
  set icon size of iconViewOptions to 96
  set background picture of iconViewOptions to file ".background:dmg-background.png" of dmgFolder
  set position of item "${productName}.app" of dmgFolder to {160, 255}
  set position of item "Applications" of dmgFolder to {440, 255}
  set position of item "${quarantineBypassCommandName}" of dmgFolder to {300, 455}
  update dmgFolder without registering applications
  delay 1
  close dmgWindow
end tell
`

  await run('osascript', ['-e', appleScript])
}

async function decorateDmgStagingDir(stagingDir) {
  const backgroundDir = path.join(stagingDir, '.background')

  await writeDmgBackground(backgroundDir)
  await run('SetFile', ['-a', 'V', backgroundDir])
  await configureDmgFinderWindow(stagingDir)
}

async function writeSizeReport(appBundlePath) {
  const resourcesRoot = path.join(appBundlePath, 'Contents', 'Resources')
  const pythonRoot = path.join(resourcesRoot, 'backend', 'python')
  const sitePackagesRoot = path.join(pythonRoot, 'lib', 'python3.13', 'site-packages')
  const frameworkStdlibRoot = path.join(
    pythonRoot,
    'Frameworks',
    'Python.framework',
    'Versions',
    '3.13',
    'lib',
    'python3.13',
  )

  const report = {
    productName,
    version,
    artifactArch,
    generatedAt: new Date().toISOString(),
    appBytes: await measurePathSize(appBundlePath),
    dmgBytes: await measurePathSize(dmgPath),
    resources: await measureChildSizes(resourcesRoot),
    sitePackages: (await measureChildSizes(sitePackagesRoot)).slice(0, 20),
    frameworkStdlib: (await measureChildSizes(frameworkStdlibRoot)).slice(0, 20),
  }

  await writeFile(releaseSizeReportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

await run('npx', ['tauri', 'build', '--target', targetTriple, '--bundles', 'app', '--no-sign'])
await syncBundledResources(appPath)
await run('node', ['scripts/inject-macos-app-icon.mjs', '--app', appPath])
await run('codesign', ['--force', '--deep', '--sign', '-', appPath])
await run('codesign', ['--verify', '--deep', '--strict', appPath])

await mkdir(dmgDir, { recursive: true })
await rm(rawDmgPath, { force: true })
await rm(dmgPath, { force: true })
await run('hdiutil', ['create', '-size', writableDmgSize, '-fs', 'HFS+', '-volname', productName, '-type', 'UDIF', '-ov', rawDmgPath])

const mountedDmgPath = await mkdtemp(path.join(os.tmpdir(), 'presto-dmg-mounted-'))
let didMountDmg = false

try {
  await run('hdiutil', ['attach', rawDmgPath, '-mountpoint', mountedDmgPath, '-nobrowse', '-noautoopen'])
  didMountDmg = true

  const mountedAppPath = path.join(mountedDmgPath, `${productName}.app`)
  const applicationsLinkPath = path.join(mountedDmgPath, 'Applications')

  await cp(appPath, mountedAppPath, { recursive: true })
  await symlink('/Applications', applicationsLinkPath)
  await writeQuarantineBypassCommand(path.join(mountedDmgPath, quarantineBypassCommandName))
  await decorateDmgStagingDir(mountedDmgPath)
  await run('sync', [])
} finally {
  if (didMountDmg) {
    await run('hdiutil', ['detach', mountedDmgPath])
  }
  await rm(mountedDmgPath, { recursive: true, force: true })
}

await run('hdiutil', ['convert', rawDmgPath, '-format', 'UDBZ', '-o', dmgPath])
await rm(rawDmgPath, { force: true })

await mkdir(releaseRoot, { recursive: true })
await rm(releaseAppPath, { recursive: true, force: true })
await rm(releaseDmgPath, { force: true })
await rm(releaseSizeReportPath, { force: true })
await cp(appPath, releaseAppPath, { recursive: true })
await cp(dmgPath, releaseDmgPath, { force: true })
await writeSizeReport(releaseAppPath)
