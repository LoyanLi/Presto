import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.join(__dirname, '../../..')

test('repo no longer exposes the static landing preview surface', () => {
  const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))
  const releaseNotes = readFileSync(path.join(repoRoot, 'docs/releases/v0.3.7-release.md'), 'utf8')

  assert.equal(packageJson.scripts?.['landing:preview'], undefined)
  assert.equal(existsSync(path.join(repoRoot, 'scripts', 'preview-static.mjs')), false)
  assert.equal(existsSync(path.join(repoRoot, 'presto-product-landing')), false)
  assert.doesNotMatch(releaseNotes, /landing:preview/)
  assert.doesNotMatch(releaseNotes, /presto-product-landing/)
})
