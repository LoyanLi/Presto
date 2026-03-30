import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('plugin runtime contract declares mac accessibility runtime service names', async () => {
  const source = await readFile(path.join(repoRoot, 'packages/contracts/src/plugins/runtime.ts'), 'utf8')

  assert.match(source, /'macAccessibility\.preflight'/)
  assert.match(source, /'macAccessibility\.runScript'/)
  assert.match(source, /'macAccessibility\.runFile'/)
})

test('plugin runtime contract exposes mac accessibility API shape', async () => {
  const source = await readFile(path.join(repoRoot, 'packages/contracts/src/plugins/runtime.ts'), 'utf8')

  assert.match(source, /macAccessibility\?:\s*\{/)
  assert.match(source, /preflight\(\): Promise<\{ ok: boolean; trusted: boolean; error\?: string \}>/)
  assert.match(source, /runScript\(script: string, args\?: string\[\]\): Promise<\{/)
  assert.match(source, /runFile\(path: string, args\?: string\[\]\): Promise<\{/)
  assert.match(source, /error\?: \{ code: string; message: string; details\?: Record<string, unknown> \}/)
})

test('sdk-runtime exports and wires mac accessibility runtime client', async () => {
  const runtimeSource = await readFile(path.join(repoRoot, 'packages/sdk-runtime/src/createPrestoRuntime.ts'), 'utf8')
  const indexSource = await readFile(path.join(repoRoot, 'packages/sdk-runtime/src/index.ts'), 'utf8')

  assert.match(runtimeSource, /import type \{ MacAccessibilityRuntimeClient \} from '\.\/clients\/macAccessibility'/)
  assert.match(runtimeSource, /macAccessibility: MacAccessibilityRuntimeClient/)
  assert.match(runtimeSource, /macAccessibility: runtime\.macAccessibility/)
  assert.match(indexSource, /MacAccessibilityRuntimeClient/)
  assert.match(indexSource, /from '\.\/clients\/macAccessibility'/)
})
