import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('rust tauri host respawns sidecar once after recoverable pipe failures', async () => {
  const rustSource = await readFile(path.join(repoRoot, 'src-tauri/src/main.rs'), 'utf8')

  assert.match(rustSource, /recoverable_sidecar_error/)
  assert.match(rustSource, /spawn_sidecar\(&self\.app\)/)
  assert.match(rustSource, /execute_sidecar_call/)
  assert.match(rustSource, /retry_after_sidecar_respawn/)
})
