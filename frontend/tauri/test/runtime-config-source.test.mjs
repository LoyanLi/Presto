import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('tauri backend launch injects PRESTO_APP_DATA_DIR so desktop config persists on disk', async () => {
  const runtimeSource = await readFile(path.join(repoRoot, 'src-tauri/src/runtime/backend.rs'), 'utf8')

  assert.match(runtimeSource, /backend_env_vars\(/)
  assert.match(runtimeSource, /"PRESTO_APP_DATA_DIR"/)
  assert.match(runtimeSource, /runtime_app_data_dir\.to_string_lossy\(\)\.to_string\(\)/)
})
