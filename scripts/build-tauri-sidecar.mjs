import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..')
const outDir = path.join(repoRoot, 'build', 'sidecar')
const outNodePath = path.join(outDir, 'node')

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
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

await mkdir(outDir, { recursive: true })
await rm(outNodePath, { force: true })

await esbuild.build({
  entryPoints: [path.join(repoRoot, 'frontend', 'sidecar', 'main.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: path.join(outDir, 'main.mjs'),
  banner: {
    js: `import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);`,
  },
  loader: {
    '.ts': 'ts',
    '.tsx': 'tsx',
  },
})

const currentArch = process.arch === 'arm64' ? 'arm64' : process.arch === 'x64' ? 'x86_64' : null
if (!currentArch) {
  throw new Error(`unsupported_sidecar_arch:${process.arch}`)
}

await run('lipo', [process.execPath, '-thin', currentArch, '-output', outNodePath])
await run('strip', ['-x', outNodePath])
