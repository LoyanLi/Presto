import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..')

const packageJsonPath = path.join(repoRoot, 'package.json')
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
const version = String(packageJson.version ?? '').trim()

if (!version) {
  throw new Error('package.json version is required')
}

const workspacePackageJsonPaths = [
  path.join(repoRoot, 'host-plugin-runtime', 'package.json'),
  path.join(repoRoot, 'packages', 'contracts', 'package.json'),
  path.join(repoRoot, 'packages', 'sdk-core', 'package.json'),
  path.join(repoRoot, 'packages', 'sdk-runtime', 'package.json'),
]

for (const targetPath of workspacePackageJsonPaths) {
  const target = JSON.parse(await readFile(targetPath, 'utf8'))
  target.version = version
  await writeFile(targetPath, `${JSON.stringify(target, null, 2)}\n`, 'utf8')
}

const tauriConfigPath = path.join(repoRoot, 'src-tauri', 'tauri.conf.json')
const tauriConfig = JSON.parse(await readFile(tauriConfigPath, 'utf8'))
tauriConfig.version = version
await writeFile(tauriConfigPath, `${JSON.stringify(tauriConfig, null, 2)}\n`, 'utf8')

const cargoTomlPath = path.join(repoRoot, 'src-tauri', 'Cargo.toml')
const cargoToml = await readFile(cargoTomlPath, 'utf8')
await writeFile(
  cargoTomlPath,
  cargoToml.replace(/^version = ".*"$/m, `version = "${version}"`),
  'utf8',
)

await writeFile(
  path.join(repoRoot, 'packages', 'contracts', 'src', 'version.ts'),
  `export const PRESTO_VERSION = '${version}'\n`,
  'utf8',
)

await writeFile(
  path.join(repoRoot, 'backend', 'presto', 'version.py'),
  `VERSION = "${version}"\n`,
  'utf8',
)
