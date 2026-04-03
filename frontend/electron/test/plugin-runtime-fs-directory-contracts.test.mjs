import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('plugin runtime fs directory contracts are removed from host boundary', async () => {
  await assert.rejects(
    readFile(path.join(repoRoot, 'packages/contracts/src/plugins/runtime.ts'), 'utf8'),
    /ENOENT/,
  )
  await assert.rejects(
    readFile(path.join(repoRoot, 'host-plugin-runtime/src/permissions/guardRuntimeAccess.ts'), 'utf8'),
    /ENOENT/,
  )

  const discoverySource = await readFile(path.join(repoRoot, 'host-plugin-runtime/src/discovery/discoverPlugins.ts'), 'utf8')
  const runtimeServicesSource = await readFile(
    path.join(repoRoot, 'host-plugin-runtime/src/discovery/runtimeServices.ts'),
    'utf8',
  )

  assert.doesNotMatch(discoverySource, /requiredRuntimeServices/)
  assert.doesNotMatch(discoverySource, /fs\.readdir|fs\.stat|fs\.getHomePath|shell\.openPath/)
  assert.doesNotMatch(runtimeServicesSource, /fs\.readdir|fs\.stat|fs\.getHomePath|shell\.openPath/)
})
