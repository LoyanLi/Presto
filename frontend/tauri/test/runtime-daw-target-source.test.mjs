import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

function sliceAfterMatch(input, pattern, length = 2000) {
  const start = input.search(pattern)
  assert.notEqual(start, -1, `Expected to find pattern: ${String(pattern)}`)
  return input.slice(start, start + length)
}

test('backend.daw-target.set restarts the backend after switching the target', async () => {
  const runtimeSource = await readFile(path.join(repoRoot, 'src-tauri/src/runtime.rs'), 'utf8')
  const source = await readFile(path.join(repoRoot, 'src-tauri/src/runtime/backend.rs'), 'utf8')
  const targetBlock = sliceAfterMatch(source, /fn set_backend_daw_target/, 1400)

  assert.match(runtimeSource, /mod backend;/)
  assert.match(runtimeSource, /mod daw_targets_generated;/)
  assert.match(runtimeSource, /use daw_targets_generated::\{DEFAULT_DAW_TARGET, SUPPORTED_DAW_TARGETS\};/)
  assert.doesNotMatch(runtimeSource, /const DEFAULT_DAW_TARGET:/)
  assert.doesNotMatch(runtimeSource, /const SUPPORTED_DAW_TARGETS:/)
  assert.match(runtimeSource, /target_daw: DEFAULT_DAW_TARGET\.to_string\(\),/)
  assert.match(targetBlock, /if !SUPPORTED_DAW_TARGETS\.contains\(&next_target\) \{/)
  assert.match(targetBlock, /stop_backend\(state,\s*"backend_daw_target_set"\)\?;/)
  assert.match(targetBlock, /backend\.target_daw = next_target\.to_string\(\);/)
  assert.match(targetBlock, /start_backend\(state\)\?;/)
  assert.match(targetBlock, /wait_for_backend_ready\(state\)\?;/)
})
