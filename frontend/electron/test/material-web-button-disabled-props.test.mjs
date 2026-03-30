import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { buildAndImportModule } from '../../ui/test/support/esbuildModule.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let buttonModulePromise = null

async function loadButtonModule() {
  if (!buttonModulePromise) {
    buttonModulePromise = buildAndImportModule({
      repoRoot,
      entryPoint: 'frontend/ui/primitives/Button.tsx',
      tempPrefix: '.tmp-ui-button-test-',
      outfileName: 'button.mjs',
    })
  }

  return buttonModulePromise
}

test('mui button wrapper omits disabled attribute when disabled is false', async () => {
  const { Button } = await loadButtonModule()

  const markup = renderToStaticMarkup(
    React.createElement(Button, {
      disabled: false,
      onClick() {},
    }, 'Open Settings'),
  )

  assert.doesNotMatch(markup, /\sdisabled="false"/)
  assert.doesNotMatch(markup, /<md-/)
  assert.match(markup, /MuiButton-root/)
})

test('mui button wrapper preserves disabled attribute when disabled is true', async () => {
  const { Button } = await loadButtonModule()

  const markup = renderToStaticMarkup(
    React.createElement(Button, {
      disabled: true,
    }, 'Open Settings'),
  )

  assert.match(markup, /\sdisabled=""/)
  assert.match(markup, /<button/)
})
