import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('esbuild-based test helpers use system temp space instead of repo-root .tmp directories', async () => {
  const helperSource = await readFile(path.join(repoRoot, 'frontend/ui/test/support/esbuildModule.mjs'), 'utf8')
  const hostThemeTestSource = await readFile(path.join(repoRoot, 'frontend/host/test/HostShellApp.mui-theme.test.mjs'), 'utf8')
  const hostSettingsTestSource = await readFile(path.join(repoRoot, 'frontend/host/test/HostShellApp.settings-surface.test.mjs'), 'utf8')

  assert.match(helperSource, /from 'node:os'/)
  assert.match(helperSource, /tmpdir\(\)/)
  assert.doesNotMatch(helperSource, /mkdtemp\(path\.join\(repoRoot,\s*tempPrefix\)\)/)
  assert.doesNotMatch(hostThemeTestSource, /mkdtemp\(path\.join\(repoRoot,\s*'\.tmp-/)
  assert.doesNotMatch(hostSettingsTestSource, /mkdtemp\(path\.join\(repoRoot,\s*'\.tmp-/)
})

test('python backend entry and tests no longer rely on sys.path injection', async () => {
  const mainApiSource = await readFile(path.join(repoRoot, 'backend/presto/main_api.py'), 'utf8')
  const importWorkflowTestSource = await readFile(path.join(repoRoot, 'backend/presto/tests/test_import_workflow.py'), 'utf8')
  const capabilitiesInvokeTestSource = await readFile(path.join(repoRoot, 'backend/presto/tests/test_capabilities_invoke.py'), 'utf8')

  assert.doesNotMatch(mainApiSource, /sys\.path\.insert/)
  assert.doesNotMatch(importWorkflowTestSource, /sys\.path\.insert/)
  assert.doesNotMatch(capabilitiesInvokeTestSource, /sys\.path\.insert/)
})
