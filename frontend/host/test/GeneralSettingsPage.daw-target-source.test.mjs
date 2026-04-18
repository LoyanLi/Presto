import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('daw settings build DAW options from the shared supported target list instead of inline literals', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/settings/DawSettingsPage.tsx'), 'utf8')

  assert.match(source, /SUPPORTED_DAW_TARGETS/)
  assert.match(source, /SUPPORTED_DAW_TARGETS\.map\(\(target\) =>/)
  assert.doesNotMatch(source, /\{\s*value:\s*'pro_tools',\s*label:\s*'Pro Tools'\s*\}/)
})
