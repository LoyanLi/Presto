import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import esbuild from 'esbuild'

export const muiNodeExternalPackages = [
  'react',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
  'react-dom',
  'react-dom/server',
  'electron',
  '@mui/material',
  '@mui/material/*',
  '@mui/icons-material',
  '@mui/icons-material/*',
  '@mui/system',
  '@mui/system/*',
  '@mui/base',
  '@mui/base/*',
  '@mui/utils',
  '@mui/utils/*',
  '@mui/private-theming',
  '@mui/private-theming/*',
  '@mui/styled-engine',
  '@mui/styled-engine/*',
  '@emotion/react',
  '@emotion/styled',
  '@emotion/cache',
  '@emotion/serialize',
  '@emotion/use-insertion-effect-with-fallbacks',
  '@emotion/utils',
  '@emotion/weak-memoize',
  '@babel/runtime',
  '@babel/runtime/*',
  'react-transition-group',
  'react-transition-group/*',
]

export async function buildAndImportModule({
  repoRoot,
  entryPoint,
  tempPrefix,
  outfileName = 'module.mjs',
  extraExternal = [],
  loader = {},
  jsx = true,
}) {
  const tempDir = await mkdtemp(path.join(tmpdir(), tempPrefix))
  const outfile = path.join(tempDir, outfileName)

  try {
    await symlink(path.join(repoRoot, 'node_modules'), path.join(tempDir, 'node_modules'), 'dir')
    await esbuild.build({
      entryPoints: [path.join(repoRoot, entryPoint)],
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      outfile,
      jsx: jsx ? 'automatic' : undefined,
      external: [...new Set([...muiNodeExternalPackages, ...extraExternal])],
      loader: {
        '.png': 'dataurl',
        '.ts': 'ts',
        '.tsx': 'tsx',
        ...loader,
      },
    })

    return await import(pathToFileURL(outfile).href)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}
