import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('developer capability inventory derives public ids from canonical contracts and includes vendor-neutral generated daw semantics', async () => {
  const inventorySource = await readFile(path.join(repoRoot, 'frontend/host/developerCapabilityInventory.ts'), 'utf8')

  assert.match(inventorySource, /from '@presto\/contracts'/)
  assert.match(inventorySource, /PUBLIC_CAPABILITY_IDS as CANONICAL_PUBLIC_CAPABILITY_IDS/)
  assert.match(inventorySource, /export const PUBLIC_CAPABILITY_IDS = CANONICAL_PUBLIC_CAPABILITY_IDS/)
  assert.match(inventorySource, /implementation\?\.kind === 'ptsl_command'/)
  assert.match(inventorySource, /return 'PTSL catalog'/)
  assert.doesNotMatch(inventorySource, /capability\.id\.startsWith\('daw\.ptsl\.'\)/)
})

test('developer capability invoker falls back to generic backend capability invocation for unified public capability coverage', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/developerCapabilityInvoker.ts'), 'utf8')

  assert.match(source, /developerRuntime\.backend\.invokeCapability/)
  assert.match(source, /capability:\s*capabilityId/)
  assert.match(source, /requestId:\s*`developer-console-/)
  assert.doesNotMatch(source, /unsupported_capability:/)
})
