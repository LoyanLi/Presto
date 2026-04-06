import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildAndImportModule } from '../../ui/test/support/esbuildModule.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let errorDisplayModulePromise = null

async function loadErrorDisplayModule() {
  if (!errorDisplayModulePromise) {
    errorDisplayModulePromise = buildAndImportModule({
      repoRoot,
      entryPoint: 'frontend/host/errorDisplay.ts',
      tempPrefix: '.tmp-host-error-display-test-',
      outfileName: 'error-display.mjs',
      jsx: false,
    })
  }

  return errorDisplayModulePromise
}

test('formatHostErrorMessage preserves structured Presto error codes and messages', async () => {
  const { formatHostErrorMessage } = await loadErrorDisplayModule()

  const message = formatHostErrorMessage(
    {
      code: 'PT_VERSION_UNSUPPORTED',
      message: 'Current Pro Tools/PTSL version 2025.6 is below required 2025.10.',
      source: 'runtime',
      retryable: false,
    },
    'Failed to read DAW connection status.',
  )

  assert.equal(
    message,
    'PT_VERSION_UNSUPPORTED: Current Pro Tools/PTSL version 2025.6 is below required 2025.10.',
  )
})

test('formatHostErrorMessage falls back to Error.message and default text', async () => {
  const { formatHostErrorMessage } = await loadErrorDisplayModule()

  assert.equal(formatHostErrorMessage(new Error('plain failure'), 'fallback'), 'plain failure')
  assert.equal(formatHostErrorMessage({ unexpected: true }, 'fallback'), 'fallback')
})
