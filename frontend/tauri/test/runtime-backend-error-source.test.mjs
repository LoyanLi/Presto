import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

function sliceAfterMatch(input, pattern, length = 2200) {
  const start = input.search(pattern)
  assert.notEqual(start, -1, `Expected to find pattern: ${String(pattern)}`)
  return input.slice(start, start + length)
}

test('tauri backend capability bridge preserves structured backend errors instead of collapsing them into transport strings', async () => {
  const source = await readFile(path.join(repoRoot, 'src-tauri/src/runtime/backend.rs'), 'utf8')
  const invokeBlock = sliceAfterMatch(source, /pub\(super\) fn invoke_backend_capability/, 2200)
  const backendErrorBlock = sliceAfterMatch(source, /fn backend_error_response_to_capability_response/, 1200)
  const normalizedErrorBlock = sliceAfterMatch(source, /fn normalize_backend_error_payload/, 1600)

  assert.match(invokeBlock, /http_json_request\(/)
  assert.match(invokeBlock, /if response\.status_code == 200/)
  assert.match(invokeBlock, /backend_error_response_to_capability_response\(/)
  assert.match(backendErrorBlock, /request\.get\("requestId"\)/)
  assert.match(backendErrorBlock, /request\.get\("capability"\)/)
  assert.match(backendErrorBlock, /"success": false/)
  assert.match(backendErrorBlock, /"error": normalize_backend_error_payload\(request, &response\)/)
  assert.match(normalizedErrorBlock, /details\.insert\("statusCode"/)
  assert.match(normalizedErrorBlock, /details\.insert\("statusLine"/)
})
