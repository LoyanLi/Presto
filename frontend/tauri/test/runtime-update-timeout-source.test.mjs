import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('release checks set curl connect and total timeouts', async () => {
  const source = await readFile(path.join(repoRoot, 'src-tauri/src/runtime.rs'), 'utf8')
  const checkForUpdates = source.slice(
    source.indexOf('fn check_for_updates'),
    source.indexOf('#[cfg(test)]'),
  )

  assert.match(checkForUpdates, /"--connect-timeout"/)
  assert.match(checkForUpdates, /"--max-time"/)
})
