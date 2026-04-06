import { cp, mkdir, mkdtemp, readFile, rm, symlink } from 'node:fs/promises'
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

const tauriConfig = JSON.parse(await readFile(path.join(repoRoot, 'src-tauri', 'tauri.conf.json'), 'utf8'))
const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))
const productName = tauriConfig.productName
const version = packageJson.version
const artifactArch = resolveArtifactArch(targetTriple)
const bundleRoot = path.join(repoRoot, 'src-tauri', 'target', targetTriple, 'release', 'bundle')
const appPath = path.join(bundleRoot, 'macos', `${productName}.app`)
const dmgDir = path.join(bundleRoot, 'dmg')
const dmgPath = path.join(dmgDir, `${productName}_${version}_${artifactArch}.dmg`)
const rawDmgPath = path.join(dmgDir, `${productName}_${version}_${artifactArch}.raw.dmg`)
const releaseRoot = path.join(repoRoot, 'release', 'tauri', artifactArch)
const releaseAppPath = path.join(releaseRoot, `${productName}.app`)
const releaseDmgPath = path.join(releaseRoot, `${productName}_${version}_${artifactArch}.dmg`)

await run('npx', ['tauri', 'build', '--target', targetTriple, '--bundles', 'app', '--no-sign'])
await run('node', ['scripts/inject-macos-app-icon.mjs', '--app', appPath])
await run('codesign', ['--force', '--deep', '--sign', '-', appPath])
await run('codesign', ['--verify', '--deep', '--strict', appPath])

const stagingDir = await mkdtemp(path.join(os.tmpdir(), 'presto-dmg-'))
const stagingAppPath = path.join(stagingDir, `${productName}.app`)
const applicationsLinkPath = path.join(stagingDir, 'Applications')

await cp(appPath, stagingAppPath, { recursive: true })
await symlink('/Applications', applicationsLinkPath)
await mkdir(dmgDir, { recursive: true })
await rm(rawDmgPath, { force: true })
await rm(dmgPath, { force: true })
await run('hdiutil', ['makehybrid', '-hfs', '-hfs-volume-name', productName, '-ov', '-o', rawDmgPath, stagingDir])
await run('hdiutil', ['convert', rawDmgPath, '-format', 'UDZO', '-o', dmgPath])
await rm(rawDmgPath, { force: true })
await rm(stagingDir, { recursive: true, force: true })

await mkdir(releaseRoot, { recursive: true })
await rm(releaseAppPath, { recursive: true, force: true })
await rm(releaseDmgPath, { force: true })
await cp(appPath, releaseAppPath, { recursive: true })
await cp(dmgPath, releaseDmgPath, { force: true })
