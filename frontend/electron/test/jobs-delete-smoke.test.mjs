import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('package.json does not expose a deletion smoke command for jobs', async () => {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))

  const smokeName = ['developer:smoke', 'jobs', 'delete'].join(':')
  assert.equal(packageJson.scripts[smokeName], undefined)
  assert.equal(packageJson.scripts['stage1:smoke'].includes(['jobs', 'delete'].join('-')), false)
})

test('formal desktop runtime no longer carries an Electron smoke harness for jobs deletion', async () => {
  const smokeHarnessPath = path.join(repoRoot, 'frontend/electron/runtime/smokeHarness.mjs')

  await assert.rejects(() => readFile(smokeHarnessPath, 'utf8'))
})
