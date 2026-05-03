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
  const initializeBlock = sliceAfterMatch(runtimeSource, /pub fn initialize/, 1800)
  const targetBlock = sliceAfterMatch(source, /fn set_backend_daw_target/, 1400)

  assert.match(runtimeSource, /mod backend;/)
  assert.match(runtimeSource, /mod daw_targets_generated;/)
  assert.match(runtimeSource, /use daw_targets_generated::\{DEFAULT_DAW_TARGET, SUPPORTED_DAW_TARGETS\};/)
  assert.doesNotMatch(runtimeSource, /const DEFAULT_DAW_TARGET:/)
  assert.doesNotMatch(runtimeSource, /const SUPPORTED_DAW_TARGETS:/)
  assert.match(initializeBlock, /let initial_backend_target_daw = load_initial_backend_target_daw\(&app\)\?;/)
  assert.match(initializeBlock, /BackendSupervisorState::new\(\s*DEFAULT_PORT,\s*initial_backend_target_daw,\s*\)/)
  assert.match(targetBlock, /if !SUPPORTED_DAW_TARGETS\.contains\(&next_target\) \{/)
  assert.match(targetBlock, /persist_backend_target_daw_preference\(state, next_target\)\?;/)
  assert.match(source, /let config_path = app_data_dir\(state\)\?\.join\("config\.json"\);/)
  assert.match(source, /write_runtime_config\(&config_path, &next_config\)/)
  assert.doesNotMatch(source, /backend-set-target-daw-get/)
  assert.doesNotMatch(source, /backend-set-target-daw-update/)
  assert.match(targetBlock, /stop_backend\(state,\s*"backend_daw_target_set"\)\?;/)
  assert.match(targetBlock, /backend\.target_daw = next_target\.to_string\(\);/)
  assert.match(targetBlock, /start_backend\(state\)\?;/)
  assert.match(targetBlock, /wait_for_backend_ready\(state\)\?;/)
})
