import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('tauri frontend build script emits a themed startup shell before renderer boot', async () => {
  const source = await readFile(path.join(repoRoot, 'scripts/build-tauri-frontend.mjs'), 'utf8')

  assert.match(source, /data-presto-theme/)
  assert.match(source, /Launching Presto/)
  assert.match(source, /Preparing desktop runtime/)
  assert.match(source, /presto\.ui\.theme\.mode/)
  assert.match(source, /\(prefers-color-scheme: dark\)/)
  assert.match(source, /window\.matchMedia/)
  assert.match(source, /background:\s*#0c0e17/)
  assert.match(source, /fonts\.googleapis\.com/)
  assert.match(source, /media="print"/)
  assert.doesNotMatch(source, /writeFile\(\s*path\.join\(outDir, 'splashscreen\.html'/)
  assert.doesNotMatch(source, /Presto is loading/)
  assert.doesNotMatch(source, /\.presto-splash__title/)
})
