import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('package.json exposes a dedicated stripSilence smoke command', async () => {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, 'package.json'), 'utf8'))

  assert.equal(
    packageJson.scripts['developer:smoke:strip-silence'],
    'npm run stage1:build && electron frontend/electron/main.mjs --smoke-target=strip-silence',
  )
  assert.match(
    packageJson.scripts['stage1:smoke'],
    /developer:smoke:strip-silence/,
  )
})

test('electron smoke harness exposes the stripSilence smoke target', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/electron/main.mjs'), 'utf8')

  assert.match(source, /if \(target === 'strip-silence'\)/)
  assert.match(source, /PRESTO_MAIN_BACKEND_PORT = '18513'/)
  assert.match(source, /waitForRendererText\(win, 'stripSilence\.open :: success'\)/)
  assert.match(source, /waitForRendererText\(win, 'stripSilence\.execute :: success'\)/)
})
