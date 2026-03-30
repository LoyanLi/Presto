import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../..')

test('capability registry is sourced from generated artifact', async () => {
  const source = await readFile(path.join(repoRoot, 'packages/contracts/src/capabilities/registry.ts'), 'utf8')

  assert.match(source, /from '\.\.\/generated\/capabilityRegistry'/)
  assert.doesNotMatch(source, /export const CAPABILITY_REGISTRY = \[/)
})
