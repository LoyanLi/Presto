import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { readFile } from 'node:fs/promises'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('tauri sidecar build thins and strips the bundled Node binary for the current macOS architecture', async () => {
  const source = await readFile(path.join(repoRoot, 'scripts/build-tauri-sidecar.mjs'), 'utf8')

  assert.match(source, /lipo/)
  assert.match(source, /strip/)
  assert.match(source, /codesign/)
  assert.match(source, /PRESTO_TAURI_TARGET/)
  assert.match(source, /aarch64-apple-darwin/)
  assert.match(source, /x86_64-apple-darwin/)
  assert.match(source, /process\.arch/)
  assert.match(source, /arm64|x64/)
  assert.doesNotMatch(source, /cp\(process\.execPath,\s*path\.join\(outDir,\s*'node'\)\)/)
})
