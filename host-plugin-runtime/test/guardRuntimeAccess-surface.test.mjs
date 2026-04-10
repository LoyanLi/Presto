import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../..')

const readSource = async (relativePath) => readFile(path.join(repoRoot, relativePath), 'utf8')

test('createPluginRuntime does not attach runtime to plugin context', async () => {
  const source = await readSource('host-plugin-runtime/src/permissions/createPluginRuntime.ts')
  assert.doesNotMatch(source, /return\s*\{[\s\S]*\bruntime\b[\s\S]*\}/)
})

test('host-plugin-runtime browser surface does not export guardRuntimeAccess', async () => {
  const source = await readSource('host-plugin-runtime/browser.ts')
  assert.doesNotMatch(source, /\bguardRuntimeAccess\b/)
})
