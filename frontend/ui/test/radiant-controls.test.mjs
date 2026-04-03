import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { buildAndImportModule } from './support/esbuildModule.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let controlsModulePromise = null

async function loadControlsModule() {
  if (!controlsModulePromise) {
    controlsModulePromise = (async () => {
      const [inputModule, selectModule, textareaModule, workflowStepperModule] = await Promise.all([
        buildAndImportModule({
          repoRoot,
          entryPoint: 'frontend/ui/primitives/Input.tsx',
          tempPrefix: '.tmp-ui-controls-test-',
          outfileName: 'input.mjs',
        }),
        buildAndImportModule({
          repoRoot,
          entryPoint: 'frontend/ui/primitives/Select.tsx',
          tempPrefix: '.tmp-ui-controls-test-',
          outfileName: 'select.mjs',
        }),
        buildAndImportModule({
          repoRoot,
          entryPoint: 'frontend/ui/primitives/Textarea.tsx',
          tempPrefix: '.tmp-ui-controls-test-',
          outfileName: 'textarea.mjs',
        }),
        buildAndImportModule({
          repoRoot,
          entryPoint: 'frontend/ui/composites/WorkflowStepper.tsx',
          tempPrefix: '.tmp-ui-controls-test-',
          outfileName: 'workflow-stepper.mjs',
        }),
      ])

      return {
        Input: inputModule.Input,
        Select: selectModule.Select,
        Textarea: textareaModule.Textarea,
        WorkflowStepper: workflowStepperModule.WorkflowStepper,
      }
    })()
  }

  return controlsModulePromise
}

test('shared field wrappers render MUI form controls instead of custom elements', async () => {
  const { Input, Select, Textarea } = await loadControlsModule()

  const inputMarkup = renderToStaticMarkup(
    React.createElement(Input, {
      label: 'Folder',
      value: '/tmp/session',
      onChange() {},
    }),
  )
  const selectMarkup = renderToStaticMarkup(
    React.createElement(Select, {
      label: 'Theme',
      value: 'dark',
      onChange() {},
      options: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
    }),
  )
  const textareaMarkup = renderToStaticMarkup(
    React.createElement(Textarea, {
      label: 'Prompt',
      value: 'Name by category',
      onChange() {},
    }),
  )

  assert.doesNotMatch(inputMarkup, /<md-/)
  assert.doesNotMatch(selectMarkup, /<md-/)
  assert.doesNotMatch(textareaMarkup, /<md-/)
  assert.match(inputMarkup, /MuiTextField-root/)
  assert.match(inputMarkup, /MuiOutlinedInput-root/)
  assert.match(inputMarkup, /ui-input--halo/)
  assert.match(selectMarkup, /MuiSelect-select/)
  assert.match(selectMarkup, /ui-select--halo/)
  assert.match(textareaMarkup, /MuiInputBase-inputMultiline/)
  assert.match(textareaMarkup, /ui-input--halo/)
})

test('shared workflow stepper renders a compact row without an outer track shell', async () => {
  const { WorkflowStepper } = await loadControlsModule()

  const markup = renderToStaticMarkup(
    React.createElement(WorkflowStepper, {
      steps: ['Session + tracks', 'Snapshots', 'Export settings'],
      currentStep: 1,
      className: 'ew-stepper',
    }),
  )

  assert.match(markup, /presto-workflow-stepper ew-stepper/)
  assert.match(markup, /presto-workflow-stepper__row/)
  assert.match(markup, /presto-workflow-stepper__item presto-workflow-stepper__item--active/)
  assert.doesNotMatch(markup, /presto-workflow-stepper__track/)
  assert.match(markup, /Session \+ tracks/)
  assert.match(markup, /Snapshots/)
  assert.match(markup, /Export settings/)
})

test('shared select source supports custom children for grouped workflow dropdowns', async () => {
  const source = await import('node:fs/promises').then(({ readFile }) =>
    readFile(path.join(repoRoot, 'frontend/ui/primitives/Select.tsx'), 'utf8'),
  )

  assert.match(source, /children/)
  assert.match(source, /children\s*\?\?\s*options\.map/)
  assert.match(source, /selectProps/)
  assert.match(source, /SelectProps=\{selectProps\}/)
})

test('dense control sources keep tabs and textarea defaults compact for desktop tool surfaces', async () => {
  const [tabsSource, textareaSource] = await Promise.all([
    import('node:fs/promises').then(({ readFile }) =>
      readFile(path.join(repoRoot, 'frontend/ui/primitives/Tabs.tsx'), 'utf8'),
    ),
    import('node:fs/promises').then(({ readFile }) =>
      readFile(path.join(repoRoot, 'frontend/ui/primitives/Textarea.tsx'), 'utf8'),
    ),
  ])

  assert.match(tabsSource, /gap:\s*'0\.35rem'/)
  assert.match(tabsSource, /padding:\s*'0\.22rem 0\.65rem'/)
  assert.match(textareaSource, /minRows=\{typeof rows === 'number' \? rows : 3\}/)
})
