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

test('electron smoke harness does not expose a dedicated deletion smoke target for jobs', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/electron/main.mjs'), 'utf8')

  const smokeTargetPattern = new RegExp(['jobs', 'delete'].join('-'))
  const cancelPattern = new RegExp(String.raw`window\.__PRESTO_SMOKE__\.jobs\.cancel\(`)
  const deletePattern = new RegExp(String.raw`window\.__PRESTO_SMOKE__\.jobs\.delete\(`)
  assert.doesNotMatch(source, smokeTargetPattern)
  assert.doesNotMatch(source, cancelPattern)
  assert.doesNotMatch(source, deletePattern)
})
