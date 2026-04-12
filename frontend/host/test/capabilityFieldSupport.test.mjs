import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildAndImportModule } from '../../ui/test/support/esbuildModule.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let modulePromise = null

async function loadCapabilityFieldSupportModule() {
  if (!modulePromise) {
    modulePromise = buildAndImportModule({
      repoRoot,
      entryPoint: 'frontend/host/capabilityFieldSupport.ts',
      tempPrefix: '.tmp-host-capability-field-support-test-',
      outfileName: 'capability-field-support.mjs',
      jsx: false,
    })
  }

  return modulePromise
}

test('validateCapabilityPayloadForDaw rejects unsupported request fields before invoking the backend', async () => {
  const { validateCapabilityPayloadForDaw } = await loadCapabilityFieldSupportModule()

  assert.throws(
    () =>
      validateCapabilityPayloadForDaw(
        {
          id: 'daw.track.recordEnable.set',
          canonicalSource: 'pro_tools',
          fieldSupport: {
            pro_tools: {
              requestFields: ['trackNames', 'enabled'],
              responseFields: ['updated', 'trackNames', 'enabled'],
            },
          },
        },
        {
          trackNames: ['Kick'],
          enabled: true,
          unsupported: true,
        },
        'pro_tools',
      ),
    (error) =>
      Boolean(
        error
        && typeof error === 'object'
        && 'code' in error
        && error.code === 'CAPABILITY_FIELDS_UNSUPPORTED'
        && 'details' in error
        && Array.isArray(error.details?.unsupportedFields)
        && error.details.unsupportedFields.includes('unsupported'),
      ),
  )
})

test('validateCapabilityPayloadForDaw skips validation when the current daw has no declared request field list', async () => {
  const { validateCapabilityPayloadForDaw } = await loadCapabilityFieldSupportModule()

  assert.doesNotThrow(() =>
    validateCapabilityPayloadForDaw(
      {
        id: 'system.health',
        canonicalSource: 'pro_tools',
        fieldSupport: {
          pro_tools: {
            requestFields: [],
            responseFields: ['ok'],
          },
        },
      },
      {
        arbitrary: true,
      },
      'pro_tools',
    ),
  )
})
