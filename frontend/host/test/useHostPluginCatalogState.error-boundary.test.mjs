import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

function sliceAfterMatch(input, pattern, length = 1800) {
  const start = input.search(pattern)
  assert.notEqual(start, -1, `Expected to find pattern: ${String(pattern)}`)
  return input.slice(start, start + length)
}

test('plugin catalog refresh failure clears stale plugin entries and rebuilds an error model', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/desktop/useHostPluginCatalogState.ts'), 'utf8')
  const refreshFailureBlock = sliceAfterMatch(
    source,
    /const message = error instanceof Error \? error\.message : 'plugin_list_refresh_failed'/,
    320,
  )

  assert.match(refreshFailureBlock, /setAutomationEntries\(\[\]\)/)
  assert.match(refreshFailureBlock, /setPluginHomeEntries\(\[\]\)/)
  assert.match(refreshFailureBlock, /setPluginPages\(\[\]\)/)
  assert.doesNotMatch(refreshFailureBlock, /\.\.\.previous/)
})
