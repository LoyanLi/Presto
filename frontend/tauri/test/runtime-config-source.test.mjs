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

test('desktop config defaults are generated from the contracts manifest', async () => {
  const manifestSource = await readFile(
    path.join(repoRoot, 'packages/contracts-manifest/app-config-defaults.json'),
    'utf8',
  )
  const pythonConfigStoreSource = await readFile(
    path.join(repoRoot, 'backend/presto/integrations/config_store.py'),
    'utf8',
  )
  const runtimeSource = await readFile(path.join(repoRoot, 'src-tauri/src/runtime.rs'), 'utf8')
  const runtimeBackendSource = await readFile(path.join(repoRoot, 'src-tauri/src/runtime/backend.rs'), 'utf8')
  const generatedRustSource = await readFile(
    path.join(repoRoot, 'src-tauri/src/runtime/app_config_defaults_generated.rs'),
    'utf8',
  )

  assert.match(manifestSource, /"hostPreferences"/)
  assert.match(pythonConfigStoreSource, /app_config_defaults_generated import create_default_app_config/)
  assert.doesNotMatch(pythonConfigStoreSource, /def create_default_app_config\(\)/)
  assert.match(runtimeSource, /mod app_config_defaults_generated;/)
  assert.match(runtimeSource, /HOST_PREFERENCES_KEY/)
  assert.match(runtimeBackendSource, /default_runtime_config/)
  assert.match(generatedRustSource, /Auto-generated from contracts-manifest\/app-config-defaults\.json/)
})
