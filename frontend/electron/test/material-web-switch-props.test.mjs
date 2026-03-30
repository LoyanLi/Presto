import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { buildAndImportModule } from '../../ui/test/support/esbuildModule.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let switchModulePromise = null

async function loadSwitchModule() {
  if (!switchModulePromise) {
    switchModulePromise = buildAndImportModule({
      repoRoot,
      entryPoint: 'frontend/ui/primitives/Switch.tsx',
      tempPrefix: '.tmp-ui-switch-test-',
      outfileName: 'switch.mjs',
    })
  }

  return switchModulePromise
}

test('switch wrapper omits false boolean attributes from MUI switch markup', async () => {
  const { Switch } = await loadSwitchModule()

  const markup = renderToStaticMarkup(
    React.createElement(Switch, {
      label: 'Developer Mode',
      selected: false,
      disabled: false,
    }),
  )

  assert.doesNotMatch(markup, /<md-switch/)
  assert.match(markup, /MuiSwitch-root/)
  assert.doesNotMatch(markup, /\schecked=""/)
  assert.doesNotMatch(markup, /\sdisabled="false"/)
})

test('switch wrapper emits checked and disabled attributes through the MUI input', async () => {
  const { Switch } = await loadSwitchModule()

  const markup = renderToStaticMarkup(
    React.createElement(Switch, {
      label: 'Developer Mode',
      selected: true,
      disabled: true,
    }),
  )

  assert.match(markup, /type="checkbox"/)
  assert.match(markup, /role="switch"/)
  assert.match(markup, /\schecked=""/)
  assert.match(markup, /\sdisabled=""/)
})
