import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let themeModulePromise = null
let designTokensModulePromise = null

async function loadModule(relativeEntry, tempPrefix, outfileName) {
  const tempDir = await mkdtemp(path.join(tmpdir(), tempPrefix))
  const outfile = path.join(tempDir, outfileName)
  try {
    await symlink(path.join(repoRoot, 'node_modules'), path.join(tempDir, 'node_modules'), 'dir')
    await esbuild.build({
      entryPoints: [path.join(repoRoot, relativeEntry)],
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      outfile,
      loader: {
        '.ts': 'ts',
        '.tsx': 'tsx',
      },
    })

    return await import(pathToFileURL(outfile).href)
  } finally {
    await rm(tempDir, { recursive: true, force: true })
  }
}

async function loadThemeModule() {
  if (!themeModulePromise) {
    themeModulePromise = loadModule('frontend/ui/theme/tokens.ts', '.tmp-ui-theme-test-', 'theme-tokens.mjs')
  }

  return themeModulePromise
}

async function loadDesignTokensModule() {
  if (!designTokensModulePromise) {
    designTokensModulePromise = loadModule('frontend/ui/tokens.ts', '.tmp-ui-design-tokens-test-', 'design-tokens.mjs')
  }

  return designTokensModulePromise
}

test('theme tokens define a real dark palette instead of cloning light values', async () => {
  const { md3ColorSchemes } = await loadThemeModule()

  assert.equal(md3ColorSchemes.light.primary, '#5b4ed6')
  assert.equal(md3ColorSchemes.light.background, '#f7f8fc')
  assert.equal(md3ColorSchemes.light.surfaceContainerHigh, '#e9ebf4')
  assert.equal(md3ColorSchemes.light.surfaceContainerHighest, '#e2e5f0')
  assert.equal(md3ColorSchemes.dark.background, '#0c0e17')
  assert.notEqual(md3ColorSchemes.dark.primary, md3ColorSchemes.light.primary)
  assert.notEqual(md3ColorSchemes.dark.surfaceContainerHigh, md3ColorSchemes.light.surfaceContainerHigh)
  assert.notEqual(md3ColorSchemes.dark.surfaceContainerHighest, md3ColorSchemes.light.surfaceContainerHighest)
})

test('typography and spatial tokens use the halo scale', async () => {
  const { md3Typography, md3Shape, md3Spacing } = await loadThemeModule()

  assert.match(md3Typography.brand, /Inter/)
  assert.match(md3Typography.plain, /Inter/)
  assert.equal(md3Typography.displaySize, '3rem')
  assert.equal(md3Typography.headlineSize, '1.5rem')
  assert.equal(md3Shape.cornerLarge, '18px')
  assert.equal(md3Shape.cornerExtraLarge, '24px')
  assert.equal(md3Spacing.xl, '24px')
  assert.equal(md3Spacing.x3, '40px')
})

test('shared design tokens export halo light roles and restrained borders', async () => {
  const { prestoBorderRoles, prestoColorRoles, prestoTypographyRoles } = await loadDesignTokensModule()

  assert.equal(prestoColorRoles.background, '#f7f8fc')
  assert.match(prestoBorderRoles.subtle, /color-mix/)
  assert.match(prestoBorderRoles.standard, /color-mix/)
  assert.match(prestoTypographyRoles.body, /Inter/)
})
