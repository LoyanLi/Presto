import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

async function exists(relativePath) {
  try {
    await access(path.join(repoRoot, relativePath))
    return true
  } catch {
    return false
  }
}

test('workspace packages keep package exports as the only public entrypoint surface', async () => {
  const contractsPackage = JSON.parse(
    await readFile(path.join(repoRoot, 'packages/contracts/package.json'), 'utf8'),
  )
  const runtimePackage = JSON.parse(
    await readFile(path.join(repoRoot, 'packages/sdk-runtime/package.json'), 'utf8'),
  )

  assert.equal(contractsPackage.exports['.'], './src/index.ts')
  assert.equal(runtimePackage.exports['.'], './src/index.ts')
  assert.equal(runtimePackage.exports['./createPrestoRuntime'], './src/createPrestoRuntime.ts')
  assert.equal(await exists('packages/contracts/index.ts'), false)
  assert.equal(await exists('packages/sdk-runtime/index.ts'), false)
  assert.equal(await exists('packages/sdk-runtime/createPrestoRuntime.ts'), false)
})
