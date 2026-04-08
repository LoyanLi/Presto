import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('rust tauri host no longer spawns or respawns a Node sidecar', async () => {
  const rustSource = await readFile(path.join(repoRoot, 'src-tauri/src/main.rs'), 'utf8')

  assert.doesNotMatch(rustSource, /recoverable_sidecar_error/)
  assert.doesNotMatch(rustSource, /spawn_sidecar/)
  assert.doesNotMatch(rustSource, /execute_sidecar_call/)
  assert.doesNotMatch(rustSource, /retry_after_sidecar_respawn/)
})
