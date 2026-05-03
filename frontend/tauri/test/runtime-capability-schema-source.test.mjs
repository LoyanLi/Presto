import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

test('sdk runtime backend capability metadata uses schema ref objects instead of string placeholders', async () => {
  const source = await readFile(path.join(repoRoot, 'packages/sdk-runtime/src/clients/backend.ts'), 'utf8')

  assert.match(source, /import type \{[^}]*SchemaRef[^}]*\} from '@presto\/contracts'/)
  assert.match(source, /requestSchema: SchemaRef/)
  assert.match(source, /responseSchema: SchemaRef/)
  assert.doesNotMatch(source, /requestSchema: string/)
  assert.doesNotMatch(source, /responseSchema: string/)
})

test('tauri runtime preserves full backend capability metadata', async () => {
  const source = await readFile(path.join(repoRoot, 'src-tauri/src/runtime/backend.rs'), 'utf8')

  assert.match(source, /"workflowScope": raw\.get\("workflow_scope"\)/)
  assert.match(source, /"portability": raw\.get\("portability"\)/)
  assert.match(source, /"implementations": raw\.get\("implementations"\)/)
})
