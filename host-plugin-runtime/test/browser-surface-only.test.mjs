import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../..')

test('host-plugin-runtime package only exports the browser surface used by the current desktop architecture', async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(repoRoot, 'host-plugin-runtime/package.json'), 'utf8'),
  )

  assert.deepEqual(packageJson.exports, {
    './browser': './browser.ts',
  })
})

test('host-plugin-runtime no longer keeps a package root export for legacy node discovery and installation flows', async () => {
  await assert.rejects(
    access(path.join(repoRoot, 'host-plugin-runtime/index.ts')),
  )
  await assert.rejects(
    access(path.join(repoRoot, 'host-plugin-runtime/src/index.ts')),
  )
})
