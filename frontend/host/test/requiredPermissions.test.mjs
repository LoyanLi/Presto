import assert from 'node:assert/strict'
import { mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'

import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let permissionsModulePromise = null

async function loadPermissionsModule() {
  if (!permissionsModulePromise) {
    permissionsModulePromise = (async () => {
      const tempDir = await mkdtemp(path.join(tmpdir(), 'presto-host-permissions-test-'))
      const outfile = path.join(tempDir, 'requiredPermissions.mjs')
      try {
        await symlink(path.join(repoRoot, 'node_modules'), path.join(tempDir, 'node_modules'), 'dir')
        await esbuild.build({
          entryPoints: [path.join(repoRoot, 'frontend/host/requiredPermissions.ts')],
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
    })()
  }

  return permissionsModulePromise
}

test('required permissions expose a stable default checklist for desktop startup scans', async () => {
  const { createDefaultRequiredHostPermissions } = await loadPermissionsModule()

  assert.deepEqual(createDefaultRequiredHostPermissions({ macAccessibilityAvailable: true }), [
    {
      id: 'macAccessibility',
      checked: false,
      granted: false,
      required: true,
      errorCode: '',
    },
  ])
  assert.deepEqual(createDefaultRequiredHostPermissions({ macAccessibilityAvailable: false }), [])
})

test('required permissions resolve granted accessibility access from the runtime preflight', async () => {
  const { scanRequiredHostPermissions, getMissingRequiredHostPermissions } = await loadPermissionsModule()

  const permissions = await scanRequiredHostPermissions({
    macAccessibilityPermissionRequiredCode: 'MAC_ACCESSIBILITY_PERMISSION_REQUIRED',
    macAccessibilityPreflight: async () => ({
      ok: true,
      trusted: true,
    }),
  })

  assert.deepEqual(permissions, [
    {
      id: 'macAccessibility',
      checked: true,
      granted: true,
      required: true,
      errorCode: '',
    },
  ])
  assert.deepEqual(getMissingRequiredHostPermissions(permissions), [])
})

test('required permissions flag missing accessibility access for startup guidance', async () => {
  const { scanRequiredHostPermissions, getMissingRequiredHostPermissions } = await loadPermissionsModule()

  const permissions = await scanRequiredHostPermissions({
    macAccessibilityPermissionRequiredCode: 'MAC_ACCESSIBILITY_PERMISSION_REQUIRED',
    macAccessibilityPreflight: async () => ({
      ok: false,
      trusted: false,
      error: 'MAC_ACCESSIBILITY_PERMISSION_REQUIRED',
    }),
  })

  assert.deepEqual(getMissingRequiredHostPermissions(permissions), [
    {
      id: 'macAccessibility',
      checked: true,
      granted: false,
      required: true,
      errorCode: 'MAC_ACCESSIBILITY_PERMISSION_REQUIRED',
    },
  ])
})
