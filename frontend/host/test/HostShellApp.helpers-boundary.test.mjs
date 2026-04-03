import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('HostShellApp delegates theme and route helper logic to a dedicated host shell helpers module', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/HostShellApp.tsx'), 'utf8')

  assert.match(source, /from '\.\/hostShellHelpers'/)
  assert.doesNotMatch(source, /function createHostMuiTheme\(/)
  assert.doesNotMatch(source, /function normalizeSettingsPageRoute\(/)
  assert.doesNotMatch(source, /function isPluginAvailableForSnapshot\(/)
})

test('HostShellApp passes the current resolved locale into DAW status polling', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/HostShellApp.tsx'), 'utf8')

  assert.match(source, /useDawStatusPolling\(\{[\s\S]*resolvedLocale,\s*[\s\S]*initialSnapshot:/)
  assert.doesNotMatch(source, /resolvedLocale:\s*initialResolvedLocale/)
})
