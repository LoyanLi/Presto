import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('generate-contracts emits shared DAW target artifacts for contracts, backend, and rust runtime', async () => {
  const source = await readFile(path.join(repoRoot, 'scripts/generate-contracts.mjs'), 'utf8')

  assert.match(source, /daw-targets\.json/)
  assert.match(source, /packages', 'contracts', 'src', 'generated'/)
  assert.match(source, /dawTargets\.ts/)
  assert.match(source, /backend', 'presto', 'domain'/)
  assert.match(source, /daw_targets_generated\.py/)
  assert.match(source, /src-tauri', 'src', 'runtime'/)
  assert.match(source, /daw_targets_generated\.rs/)
})

test('backend and rust runtime consume generated DAW target artifacts instead of duplicating inline target lists', async () => {
  const [backendSource, runtimeSource] = await Promise.all([
    readFile(path.join(repoRoot, 'backend/presto/domain/capabilities.py'), 'utf8'),
    readFile(path.join(repoRoot, 'src-tauri/src/runtime.rs'), 'utf8'),
  ])

  assert.match(
    backendSource,
    /from \.daw_targets_generated import DawTarget, DEFAULT_DAW_TARGET, RESERVED_DAW_TARGETS, SUPPORTED_DAW_TARGETS/,
  )
  assert.doesNotMatch(backendSource, /DawTarget = Literal\[/)
  assert.match(runtimeSource, /mod daw_targets_generated;/)
})
