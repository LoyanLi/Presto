import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('developer capability console derives side effects from canonical capability kind instead of overlay metadata', async () => {
  const consoleSource = await readFile(path.join(repoRoot, 'frontend/host/DeveloperCapabilityConsole.tsx'), 'utf8')
  const inventorySource = await readFile(path.join(repoRoot, 'frontend/host/developerCapabilityInventory.ts'), 'utf8')

  assert.match(consoleSource, /kind\s*!==\s*'query'/)
  assert.match(consoleSource, /function mergeCapabilityDefinition\(/)
  assert.match(consoleSource, /\.\.\.overlay,\s*\.\.\.capability,\s*sideEffect:\s*capability\.kind\s*!==\s*'query'/s)
  assert.doesNotMatch(inventorySource, /\bsideEffect:\b/)
  assert.doesNotMatch(inventorySource, /\bdomain:\b/)
})
