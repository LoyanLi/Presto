import { cp, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..')
const outDir = path.join(repoRoot, 'build', 'sidecar')

await mkdir(outDir, { recursive: true })

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

await cp(process.execPath, path.join(outDir, 'node'))
