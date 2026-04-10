import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('workflow plugin manifest keeps only currently implemented plugin surfaces', async () => {
  const manifestSource = await readFile(
    path.join(repoRoot, 'packages/contracts/src/plugins/manifest.ts'),
    'utf8',
  )
  const pageSource = await readFile(
    path.join(repoRoot, 'packages/contracts/src/plugins/page.ts'),
    'utf8',
  )
  const pluginIndexSource = await readFile(
    path.join(repoRoot, 'packages/contracts/src/plugins/index.ts'),
    'utf8',
  )

  assert.doesNotMatch(manifestSource, /\bnavigationItems\??:/)
  assert.doesNotMatch(manifestSource, /\bcommands\??:/)
  assert.doesNotMatch(pageSource, /\binterface PluginNavigationItem\b/)
  assert.doesNotMatch(pageSource, /\binterface PluginCommandDefinition\b/)
  assert.doesNotMatch(pluginIndexSource, /\bPluginNavigationItem\b/)
  assert.doesNotMatch(pluginIndexSource, /\bPluginCommandDefinition\b/)
})
