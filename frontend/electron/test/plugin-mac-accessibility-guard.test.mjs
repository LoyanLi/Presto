import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

const readSource = async (relativePath) => readFile(path.join(repoRoot, relativePath), 'utf8')

test('host plugin loader does not inject runtime into createPluginRuntime', async () => {
  const source = await readSource('frontend/host/pluginHostRuntime.ts')
  assert.doesNotMatch(source, /createPluginRuntime\([\s\S]*\bruntime\b\s*:/)
})
