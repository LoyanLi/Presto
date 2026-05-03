import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

function sliceAfterMatch(input, pattern, length = 2200) {
  const start = input.search(pattern)
  assert.notEqual(start, -1, `Expected to find pattern: ${String(pattern)}`)
  return input.slice(start, start + length)
}

test('tauri runtime initializes backend target daw from persisted desktop config instead of a hardcoded default only', async () => {
  const source = await readFile(path.join(repoRoot, 'src-tauri/src/runtime.rs'), 'utf8')
  const initializeBlock = sliceAfterMatch(source, /pub fn initialize/, 1800)

  assert.match(source, /fn load_initial_backend_target_daw\(/)
  assert.match(source, /config\.json/)
  assert.match(source, /hostPreferences/)
  assert.match(source, /dawTarget/)
  assert.match(initializeBlock, /let initial_backend_target_daw = load_initial_backend_target_daw\(&app\)\?/)
  assert.match(initializeBlock, /BackendSupervisorState::new\(\s*DEFAULT_PORT,\s*initial_backend_target_daw,\s*\)/)
  assert.match(source, /SUPPORTED_DAW_TARGETS\.contains\(&target\)/)
})
