import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildAndImportModule } from '../../ui/test/support/esbuildModule.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let cardModulePromise = null

async function loadCardModule() {
  if (!cardModulePromise) {
    cardModulePromise = buildAndImportModule({
      repoRoot,
      entryPoint: 'frontend/host/automation/cards/SplitStereoToMonoCard.tsx',
      tempPrefix: '.tmp-host-automation-card-test-',
      outfileName: 'split-stereo-card.mjs',
    })
  }

  return cardModulePromise
}

test('split stereo automation preserves structured backend error messages', async () => {
  const { getSplitStereoAutomationErrorMessage } = await loadCardModule()

  const message = getSplitStereoAutomationErrorMessage('en', {
    code: 'TRACK_SELECTION_INVALID',
    message: 'Exactly one track must be selected in Pro Tools before running this automation.',
    source: 'capability',
    retryable: false,
  })

  assert.equal(message, 'Exactly one track must be selected in Pro Tools before running this automation.')
})

test('split stereo automation falls back to localized unknown error text', async () => {
  const { getSplitStereoAutomationErrorMessage } = await loadCardModule()

  const message = getSplitStereoAutomationErrorMessage('en', { code: 'TRACK_SELECTION_INVALID' })

  assert.equal(message, 'Automation failed.')
})

test('split stereo automation card exposes keep-channel selection and executes the generic automation capability', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/automation/cards/SplitStereoToMonoCard.tsx'), 'utf8')

  assert.match(source, /Select/)
  assert.match(source, /keepChannel/)
  assert.match(source, /splitStereoToMono\?\.execute/)
  assert.doesNotMatch(source, /splitStereoToMono\?\.keepLeft/)
})
