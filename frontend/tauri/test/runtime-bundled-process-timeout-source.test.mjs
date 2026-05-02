import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('bundled process execution has a runtime timeout boundary', async () => {
  const source = await readFile(path.join(repoRoot, 'src-tauri/src/runtime.rs'), 'utf8')
  const start = source.indexOf('fn execute_bundled_process')
  const end = source.indexOf('fn std_out_key')
  const executeBundledProcess = source.slice(
    start,
    end,
  )

  assert.notEqual(start, -1)
  assert.notEqual(end, -1)
  assert.match(executeBundledProcess, /run_command_capture_with_timeout/)
  assert.match(source, /BUNDLED_PROCESS_TIMEOUT/)
  assert.match(source, /kill\(\)/)
})
