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
      entryPoint: 'frontend/host/automation/cards/AutomationRunnerCard.tsx',
      tempPrefix: '.tmp-host-automation-card-test-',
      outfileName: 'automation-runner-card.mjs',
    })
  }

  return cardModulePromise
}

test('automation runner card preserves structured runner error messages', async () => {
  const { getAutomationErrorMessage } = await loadCardModule()

  const message = getAutomationErrorMessage('en', {
    code: 'TRACK_SELECTION_INVALID',
    message: 'Exactly one track must be selected in Pro Tools before running this automation.',
  })

  assert.equal(message, 'Exactly one track must be selected in Pro Tools before running this automation.')
})

test('automation runner card falls back to localized unknown error text', async () => {
  const { getAutomationErrorMessage } = await loadCardModule()

  const message = getAutomationErrorMessage('en', { code: 'TRACK_SELECTION_INVALID' })

  assert.equal(message, 'Automation failed.')
})

test('automation runner card source renders host-driven switch and select fields', async () => {
  const source = await readFile(path.join(repoRoot, 'frontend/host/automation/cards/AutomationRunnerCard.tsx'), 'utf8')

  assert.match(source, /Switch/)
  assert.match(source, /Select/)
  assert.match(source, /entry\.optionsSchema/)
  assert.match(source, /entry\.execute\(values\)/)
  assert.doesNotMatch(source, /splitStereoToMono\?\.execute/)
})
