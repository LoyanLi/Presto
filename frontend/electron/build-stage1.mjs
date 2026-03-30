import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(currentDir, '.stage1')
const repoRoot = path.resolve(currentDir, '../..')
const sourceAppIconDir = path.join(repoRoot, 'assets', 'App.icon')
const packagedBuildDir = path.join(repoRoot, 'frontend', 'build')
const packagedAppIconDir = path.join(packagedBuildDir, 'App.icon')
const buildForPackaging = process.env.PRESTO_STAGE1_MINIFY === '1'
const sourcemap = process.env.PRESTO_STAGE1_SOURCEMAP === '0' ? false : 'inline'

await mkdir(outDir, { recursive: true })
await mkdir(packagedBuildDir, { recursive: true })
await rm(packagedAppIconDir, { recursive: true, force: true })
await cp(sourceAppIconDir, packagedAppIconDir, { recursive: true })

await esbuild.build({
  entryPoints: [path.join(currentDir, 'preload.ts')],
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['electron'],
  outfile: path.join(outDir, 'preload.cjs'),
  minify: buildForPackaging,
  sourcemap,
})

await esbuild.build({
  entryPoints: [path.join(currentDir, 'runtime', 'backendSupervisor.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: path.join(outDir, 'backendSupervisor.mjs'),
  minify: buildForPackaging,
  sourcemap,
})

await esbuild.build({
  entryPoints: [path.join(currentDir, 'runtime', 'pluginHostService.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  outfile: path.join(outDir, 'pluginHostService.mjs'),
  minify: buildForPackaging,
  sourcemap,
})

await esbuild.build({
  entryPoints: [path.join(currentDir, 'renderer.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  target: 'es2020',
  outfile: path.join(outDir, 'renderer.js'),
  minify: buildForPackaging,
  sourcemap,
  loader: {
    '.css': 'css',
    '.png': 'dataurl',
    '.ts': 'ts',
    '.tsx': 'tsx',
  },
})

await writeFile(
  path.join(currentDir, 'index.html'),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Presto</title>
    <link rel="stylesheet" href="./.stage1/renderer.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./.stage1/renderer.js"></script>
  </body>
</html>
`,
)
