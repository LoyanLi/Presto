import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '..')
const outDir = path.join(repoRoot, 'build', 'tauri', 'renderer')

await mkdir(outDir, { recursive: true })

await esbuild.build({
  entryPoints: [path.join(repoRoot, 'frontend', 'tauri', 'renderer.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'browser',
  jsx: 'automatic',
  target: 'es2020',
  outfile: path.join(outDir, 'renderer.js'),
  external: [
    'node:child_process',
    'node:fs/promises',
    'node:path',
    'node:url',
  ],
  loader: {
    '.css': 'css',
    '.png': 'dataurl',
    '.ts': 'ts',
    '.tsx': 'tsx',
  },
})

await writeFile(
  path.join(outDir, 'index.html'),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Presto</title>
    <link rel="stylesheet" href="./renderer.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./renderer.js"></script>
  </body>
</html>
`,
)
