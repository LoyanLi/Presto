import { cp } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const prebuiltAssetsDir = path.join(repoRoot, 'assets', 'macos-icon')
const bundledIcnsPath = path.join(repoRoot, 'src-tauri', 'icons', 'icon.icns')
const usage = `
Usage: node scripts/inject-macos-app-icon.mjs --app /path/to/Presto.app

Options:
  --app   Absolute path to the built macOS .app
  --help  Show this message
`

function fail(code, detail) {
  if (!detail) {
    throw new Error(code)
  }
  throw new Error(`${code}:${detail}`)
}

function parseArgs(argv) {
  const parsed = {}
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--help') {
      parsed.help = true
      continue
    }
    if (!arg.startsWith('--')) continue
    const next = argv[i + 1]
    if (!next || next.startsWith('--')) {
      throw new Error(`Missing value for ${arg}`)
    }
    parsed[arg.slice(2)] = next
    i += 1
  }
  return parsed
}

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      ...options,
    })
    child.once('error', reject)
    child.once('exit', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} ${args.join(' ')} exited with ${code}`))
    })
  })
}

function resolveArtifactArch(appPath) {
  const targetTriple = process.env.PRESTO_TAURI_TARGET?.trim()
  if (targetTriple === 'aarch64-apple-darwin') {
    return 'arm64'
  }
  if (targetTriple === 'x86_64-apple-darwin') {
    return 'x64'
  }
  if (appPath.includes(`${path.sep}aarch64-apple-darwin${path.sep}`) || appPath.includes(`${path.sep}arm64${path.sep}`)) {
    return 'arm64'
  }
  if (appPath.includes(`${path.sep}x86_64-apple-darwin${path.sep}`) || appPath.includes(`${path.sep}x64${path.sep}`)) {
    return 'x64'
  }
  fail('unsupported_arch', targetTriple || appPath)
}

async function main() {
  const { help, app: appPath } = parseArgs(process.argv.slice(2))
  if (help) {
    process.stdout.write(usage)
    process.exit(0)
  }
  if (process.platform !== 'darwin') {
    fail('macos_only')
  }
  if (!appPath) {
    throw new Error('--app is required')
  }
  const resolvedAppPath = path.resolve(appPath)
  const infoPlist = path.join(resolvedAppPath, 'Contents', 'Info.plist')
  const resourcesDir = path.join(resolvedAppPath, 'Contents', 'Resources')
  if (!existsSync(resolvedAppPath)) {
    fail('missing_app_bundle', resolvedAppPath)
  }
  const artifactArch = resolveArtifactArch(resolvedAppPath)
  const assetsCarSource = path.join(prebuiltAssetsDir, artifactArch, 'Assets.car')
  if (!existsSync(assetsCarSource)) {
    fail('missing_assets_car_source', assetsCarSource)
  }
  if (!existsSync(bundledIcnsPath)) {
    fail('missing_icns_source', bundledIcnsPath)
  }

  await cp(assetsCarSource, path.join(resourcesDir, 'Assets.car'))
  await cp(bundledIcnsPath, path.join(resourcesDir, 'icon.icns'))
  await run('/usr/libexec/PlistBuddy', ['-c', 'Delete :CFBundleIconFiles', infoPlist])
    .catch(() => {})
  try {
    await run('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleIconFile icon.icns', infoPlist])
  } catch {
    await run('/usr/libexec/PlistBuddy', ['-c', 'Add :CFBundleIconFile string icon.icns', infoPlist])
  }
  try {
    await run('/usr/libexec/PlistBuddy', ['-c', 'Set :CFBundleIconName Icon', infoPlist])
  } catch {
    await run('/usr/libexec/PlistBuddy', ['-c', 'Add :CFBundleIconName string Icon', infoPlist])
  }
}

main().catch((error) => {
  console.error('Error:', error.message)
  process.exit(1)
})
