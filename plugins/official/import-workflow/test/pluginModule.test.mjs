import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let pluginModulePromise = null

function createSharedUiMock() {
  return {
    Select({ label, options = [], className, children, ...props }) {
      return React.createElement(
        'label',
        { className: ['ui-select', className].filter(Boolean).join(' ') },
        label ? React.createElement('span', null, label) : null,
        React.createElement(
          'select',
          props,
          children ??
            options.map((option) =>
              React.createElement('option', { key: option.value, value: option.value }, option.label),
            ),
        ),
      )
    },
  }
}

function createPluginContext() {
  return {
    pluginId: 'official.import-workflow',
    locale: {
      requested: 'en',
      resolved: 'en',
    },
    presto: {
      workflow: {
        run: {
          start: async () => ({ jobId: 'job-test', capability: 'workflow.run.start', state: 'queued' }),
        },
      },
      import: {
        analyze: async () => ({
          folderPaths: [],
          orderedFilePaths: [],
          rows: [],
          cache: { files: 0, hits: 0 },
        }),
        cache: {
          save: async () => ({ saved: true, cacheFiles: 0 }),
        },
      },
      track: {
        listNames: async () => ({ names: [] }),
        rename: async () => {},
        select: async () => {},
        color: {
          apply: async () => {},
        },
      },
      stripSilence: {
        open: async () => {},
        execute: async () => {},
      },
      clip: {
        selectAllOnTrack: async () => {},
      },
      session: {
        save: async () => {},
      },
      jobs: {
        get: async () => ({
          state: 'succeeded',
          progress: {
            current: 0,
            total: 0,
            percent: 0,
          },
        }),
        cancel: async () => {},
      },
    },
    storage: {
      async get() {
        return null
      },
      async set() {},
      async delete() {},
    },
    logger: console,
  }
}

async function loadPageModuleWithHookHarness(overrides = {}) {
  const previousWindow = globalThis.window
  const originals = {
    useState: React.useState,
    useRef: React.useRef,
    useMemo: React.useMemo,
    useCallback: React.useCallback,
    useEffect: React.useEffect,
  }
  let stateCallIndex = 0
  const stateUpdates = []

  React.useState = (initialValue) => {
    stateCallIndex += 1
    const currentIndex = stateCallIndex
    const resolvedInitialValue = typeof initialValue === 'function' ? initialValue() : initialValue
    const resolvedValue = Object.prototype.hasOwnProperty.call(overrides, currentIndex)
      ? overrides[currentIndex]
      : resolvedInitialValue
    const setter = (nextValue) => {
      stateUpdates.push({
        index: currentIndex,
        value: nextValue,
      })
    }
    return [resolvedValue, setter]
  }
  React.useRef = (initialValue) => ({ current: initialValue })
  React.useMemo = (factory) => factory()
  React.useCallback = (callback) => callback
  React.useEffect = () => {}

  globalThis.window = {
    __PRESTO_PLUGIN_SHARED__: {
      React,
      ui: createSharedUiMock(),
    },
  }

  const restore = () => {
    React.useState = originals.useState
    React.useRef = originals.useRef
    React.useMemo = originals.useMemo
    React.useCallback = originals.useCallback
    React.useEffect = originals.useEffect
    if (previousWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = previousWindow
    }
  }

  try {
    const pageUrl = new URL('../dist/ImportWorkflowPage.mjs', import.meta.url)
    pageUrl.searchParams.set('test', String(Date.now()))
    pageUrl.searchParams.set('scenario', Math.random().toString(36).slice(2))
    const pageModule = await import(pageUrl.href)
    return { pageModule, stateUpdates, restore }
  } catch (error) {
    restore()
    throw error
  }
}

function getElementText(node) {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map((child) => getElementText(child)).join('')
  }
  return getElementText(node?.props?.children)
}

function findElement(node, predicate) {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return null
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate)
      if (match) {
        return match
      }
    }
    return null
  }
  if (typeof node !== 'object') {
    return null
  }
  if (predicate(node)) {
    return node
  }
  for (const value of Object.values(node?.props ?? {})) {
    const match = findElement(value, predicate)
    if (match) {
      return match
    }
  }
  return null
}

function hasFolderSelectionUpdate(stateUpdates, expectedFolders) {
  return stateUpdates.some(
    (update) =>
      Array.isArray(update?.value) &&
      update.value.length === expectedFolders.length &&
      update.value.every((value, index) => value === expectedFolders[index]),
  )
}

function resolveLatestStateValue(stateUpdates, stateIndex, initialValue) {
  let currentValue = initialValue
  for (const update of stateUpdates) {
    if (update.index !== stateIndex) {
      continue
    }
    currentValue = typeof update.value === 'function' ? update.value(currentValue) : update.value
  }
  return currentValue
}

async function loadPluginModule() {
  if (!pluginModulePromise) {
    const previousWindow = globalThis.window
    globalThis.window = {
      __PRESTO_PLUGIN_SHARED__: {
        React,
        ui: createSharedUiMock(),
      },
    }

    const entryUrl = new URL('../dist/entry.mjs', import.meta.url)
    entryUrl.searchParams.set('test', String(Date.now()))
    pluginModulePromise = import(entryUrl.href).finally(() => {
      if (previousWindow === undefined) {
        delete globalThis.window
      } else {
        globalThis.window = previousWindow
      }
    })
  }

  return pluginModulePromise
}

test('plugin module exports workflow manifest and page export', async () => {
  const pluginModule = await loadPluginModule()
  assert.equal(pluginModule.manifest.pluginId, 'official.import-workflow')
  assert.equal(pluginModule.manifest.entry, 'dist/entry.mjs')
  assert.equal(pluginModule.manifest.styleEntry, 'dist/import-workflow.css')
  assert.equal(pluginModule.manifest.pages[0]?.componentExport, 'ImportWorkflowPage')
  assert.equal(pluginModule.manifest.workflowDefinition?.workflowId, 'official.import-workflow.run')
  assert.equal(pluginModule.manifest.workflowDefinition?.definitionEntry, 'dist/workflow-definition.json')
  assert.equal(pluginModule.manifest.pages.length, 1)
  assert.equal('navigationItems' in pluginModule.manifest, false)
  assert.equal('commands' in pluginModule.manifest, false)
  assert.equal(pluginModule.manifest.settingsPages[0]?.pageId, 'import-workflow.page.settings')
  assert.equal(pluginModule.manifest.settingsPages[0]?.loadExport, 'loadImportWorkflowSettings')
  assert.equal(pluginModule.manifest.settingsPages[0]?.saveExport, 'saveImportWorkflowSettings')
  assert.equal(typeof pluginModule.activate, 'function')
  assert.equal(typeof pluginModule.ImportWorkflowPage, 'function')
  assert.equal(typeof pluginModule.loadImportWorkflowSettings, 'function')
  assert.equal(typeof pluginModule.saveImportWorkflowSettings, 'function')
})

test('manifest.json stays aligned with module manifest essentials', async () => {
  const pluginModule = await loadPluginModule()
  const raw = await readFile(new URL('../manifest.json', import.meta.url), 'utf8')
  const fileManifest = JSON.parse(raw)

  assert.equal(fileManifest.pluginId, pluginModule.manifest.pluginId)
  assert.equal(fileManifest.entry, pluginModule.manifest.entry)
  assert.equal(fileManifest.styleEntry, pluginModule.manifest.styleEntry)
  assert.deepEqual(fileManifest.workflowDefinition, pluginModule.manifest.workflowDefinition)
  assert.deepEqual(fileManifest.requiredCapabilities, pluginModule.manifest.requiredCapabilities)
  assert.deepEqual(fileManifest.adapterModuleRequirements, pluginModule.manifest.adapterModuleRequirements)
  assert.deepEqual(fileManifest.capabilityRequirements, pluginModule.manifest.capabilityRequirements)
  assert.equal(Array.isArray(fileManifest.adapterModuleRequirements), true)
  assert.equal(fileManifest.adapterModuleRequirements.length > 0, true)
  assert.equal(
    fileManifest.adapterModuleRequirements.some(
      (item) => item.moduleId === 'import' && item.minVersion === '2025.10.0',
    ),
    true,
  )
  assert.equal(Array.isArray(fileManifest.capabilityRequirements), true)
  assert.equal(fileManifest.capabilityRequirements.length > 0, true)
  assert.equal(
    fileManifest.capabilityRequirements.some(
      (item) => item.capabilityId === 'workflow.run.start' && item.minVersion === '2025.10.0',
    ),
    true,
  )
  assert.deepEqual(fileManifest.settingsPages, pluginModule.manifest.settingsPages)
  assert.equal(fileManifest.requiredRuntimeServices, undefined)
})

test('workflow definition batches post-import operations in the same order shown by progress stages', async () => {
  const definition = JSON.parse(await readFile(new URL('../dist/workflow-definition.json', import.meta.url), 'utf8'))
  const renameSteps = definition.steps[2]?.steps ?? []
  const colorSteps = definition.steps[3]?.steps ?? []
  const stripSteps = definition.steps[4]?.steps ?? []
  const fadeSteps = definition.steps[5]?.steps ?? []

  assert.deepEqual(
    definition.steps.map((step) => step.stepId),
    ['import_files', 'plan_items', 'rename', 'color', 'strip', 'fade', 'save_session'],
  )
  assert.equal(definition.steps[2]?.foreach?.as, 'item')
  assert.equal(definition.steps[3]?.foreach?.as, 'item')
  assert.equal(definition.steps[4]?.foreach?.as, 'item')
  assert.equal(definition.steps[5]?.foreach?.as, 'item')
  assert.deepEqual(
    Object.keys(definition.steps[0]?.input ?? {}).sort(),
    ['deleteIxmlIfPresent', 'folderPaths', 'importMode', 'orderedFilePaths'],
  )
  assert.deepEqual(renameSteps.map((step) => step.stepId), ['rename_track'])
  assert.deepEqual(renameSteps.map((step) => step.usesCapability), ['daw.track.rename'])
  assert.deepEqual(colorSteps.map((step) => step.stepId), ['apply_color'])
  assert.deepEqual(colorSteps.map((step) => step.usesCapability), ['daw.track.color.apply'])
  assert.deepEqual(stripSteps.map((step) => step.stepId), ['select_track', 'select_clips', 'strip_silence'])
  assert.deepEqual(
    stripSteps.map((step) => step.usesCapability),
    ['daw.track.select', 'daw.clip.selectAllOnTrack', 'daw.stripSilence.execute'],
  )
  assert.deepEqual(fadeSteps.map((step) => step.stepId), ['select_track', 'select_clips', 'fade_clips'])
  assert.deepEqual(
    fadeSteps.map((step) => step.usesCapability),
    ['daw.track.select', 'daw.clip.selectAllOnTrack', 'daw.editing.createFadesBasedOnPreset'],
  )
})

test('dist modules resolve React through a plugin-local shared helper', async () => {
  const [pageSource, entrySource, uiSource, helperSource] = await Promise.all([
    readFile(new URL('../dist/ImportWorkflowPage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/entry.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/ui.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/react-shared.mjs', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(pageSource, /from ['"]react['"]/)
  assert.doesNotMatch(uiSource, /from ['"]react['"]/)
  assert.match(pageSource, /react-shared\.mjs/)
  assert.doesNotMatch(pageSource, /workflow-definition\.mjs/)
  assert.doesNotMatch(entrySource, /ImportWorkflowSettingsPage/)
  assert.doesNotMatch(entrySource, /workflow-definition\.mjs/)
  assert.match(uiSource, /react-shared\.mjs/)
  assert.match(helperSource, /__PRESTO_PLUGIN_SHARED__/)
})

test('main page does not reference plugin runtime services', async () => {
  const pageSource = await readFile(new URL('../dist/ImportWorkflowPage.mjs', import.meta.url), 'utf8')
  assert.doesNotMatch(pageSource, /context\.runtime/)
})

test('settings schema stays declarative and keeps the implemented import controls', async () => {
  const pluginModule = await loadPluginModule()
  const settingsPage = pluginModule.manifest.settingsPages[0]

  assert.equal(settingsPage.sections.length, 3)
  assert.equal(settingsPage.sections[0]?.title, 'AI naming')
  assert.equal(settingsPage.sections[1]?.title, 'Run defaults')
  assert.equal(settingsPage.sections[2]?.title, 'Categories and colors')
  assert.equal(settingsPage.sections[2]?.fields[0]?.kind, 'categoryList')
  assert.equal(settingsPage.sections[2]?.fields[0]?.path, 'categories')
  assert.equal(settingsPage.sections[0]?.fields.some((field) => field.path === 'aiConfig.prompt'), true)
  assert.equal(settingsPage.sections[1]?.fields.some((field) => field.path === 'ui.analyzeCacheEnabled'), true)
  assert.equal(settingsPage.sections[1]?.fields.some((field) => field.path === 'ui.importAudioMode'), true)
  assert.equal(settingsPage.sections[1]?.fields.some((field) => field.path === 'ui.deleteIxmlIfPresent'), true)
  assert.equal(settingsPage.sections[1]?.fields.some((field) => field.path === 'ui.fadeAfterStrip'), true)
  assert.equal(settingsPage.sections[1]?.fields.some((field) => field.path === 'ui.fadePresetName'), true)
  assert.equal(settingsPage.sections[1]?.fields.some((field) => field.path === 'ui.fadeAutoAdjustBounds'), true)
  assert.equal(settingsPage.sections.flatMap((section) => section.fields).some((field) => field.path === 'silenceProfile.thresholdDb'), false)
})

test('main page only passes ixml cleanup through workflow run input when import mode is copy', async () => {
  const { pageModule, restore } = await loadPageModuleWithHookHarness({
    1: {
      categories: [
        { id: 'drums', name: 'Drums', colorSlot: 3, previewHex: '#111111' },
      ],
      silenceProfile: {
        thresholdDb: -48,
        minStripMs: 120,
        minSilenceMs: 120,
        startPadMs: 5,
        endPadMs: 20,
      },
      aiConfig: {
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        timeoutSeconds: 30,
        apiKey: '',
        prompt: 'test',
      },
      ui: {
        analyzeCacheEnabled: true,
        stripAfterImport: true,
        autoSaveSession: true,
        importAudioMode: 'link',
        deleteIxmlIfPresent: true,
        fadeAfterStrip: true,
        fadePresetName: 'Short Vocal Fade',
        fadeAutoAdjustBounds: false,
      },
    },
    2: [
      {
        filePath: '/Imports/Drums/kick.wav',
        categoryId: 'drums',
        aiName: 'Kick In',
        finalName: 'Kick In',
        status: 'ready',
        errorMessage: null,
        hasIxml: true,
      },
    ],
    3: ['/Imports/Drums'],
    4: 3,
    5: false,
  })
  const payloads = []
  const testContext = createPluginContext()
  testContext.presto.track.listNames = async () => ({ names: [] })
  testContext.presto.workflow.run.start = async (payload) => {
    payloads.push(payload)
    return { jobId: 'job-run-options', capability: 'workflow.run.start', state: 'queued' }
  }

  try {
    const tree = pageModule.ImportWorkflowPage({
      context: {
        ...testContext,
      },
      params: {},
      searchParams: new URLSearchParams(),
    })

    const runButton = findElement(
      tree,
      (node) => typeof node.type === 'function' && getElementText(node.props?.children) === 'Run import',
    )

    assert.ok(runButton, 'expected import step 3 to render a Run import action')

    runButton.props.onClick()
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.equal(payloads.length, 1)
    assert.deepEqual(payloads[0]?.input?.ui, {
      analyzeCacheEnabled: true,
      stripAfterImport: true,
      autoSaveSession: true,
      importAudioMode: 'link',
      deleteIxmlIfPresent: false,
      fadeAfterStrip: true,
      fadePresetName: 'Short Vocal Fade',
      fadeAutoAdjustBounds: false,
    })
  } finally {
    restore()
  }
})

test('main page allows workflow start when fade is enabled without a preset name', async () => {
  const { pageModule, stateUpdates, restore } = await loadPageModuleWithHookHarness({
    1: {
      categories: [
        { id: 'drums', name: 'Drums', colorSlot: 3, previewHex: '#111111' },
      ],
      silenceProfile: {
        thresholdDb: -48,
        minStripMs: 120,
        minSilenceMs: 120,
        startPadMs: 5,
        endPadMs: 20,
      },
      aiConfig: {
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        timeoutSeconds: 30,
        apiKey: '',
        prompt: 'test',
      },
      ui: {
        analyzeCacheEnabled: true,
        stripAfterImport: true,
        autoSaveSession: true,
        importAudioMode: 'copy',
        deleteIxmlIfPresent: false,
        fadeAfterStrip: true,
        fadePresetName: '',
        fadeAutoAdjustBounds: true,
      },
    },
    2: [
      {
        filePath: '/Imports/Drums/kick.wav',
        categoryId: 'drums',
        aiName: 'Kick In',
        finalName: 'Kick In',
        status: 'ready',
        errorMessage: null,
      },
    ],
    3: ['/Imports/Drums'],
    4: 3,
    5: false,
  })
  let runCalls = 0
  const testContext = createPluginContext()
  testContext.presto.workflow.run.start = async () => {
    runCalls += 1
    return { jobId: 'should-not-run', capability: 'workflow.run.start', state: 'queued' }
  }

  try {
    const tree = pageModule.ImportWorkflowPage({
      context: testContext,
      params: {},
      searchParams: new URLSearchParams(),
    })

    const runButton = findElement(
      tree,
      (node) => typeof node.type === 'function' && getElementText(node.props?.children) === 'Run import',
    )

    assert.ok(runButton, 'expected import step 3 to render a Run import action')

    runButton.props.onClick()
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.equal(runCalls, 1)
    assert.equal(
      stateUpdates.some((update) => update.index === 7 && update.value === 'Fade preset name is required when post-strip fade is enabled.'),
      false,
    )
  } finally {
    restore()
  }
})

test('main page step 3 does not render import mode or ixml cleanup controls', async () => {
  const { pageModule, restore } = await loadPageModuleWithHookHarness({
    1: {
      categories: [{ id: 'drums', name: 'Drums', colorSlot: 3, previewHex: '#111111' }],
      silenceProfile: {
        thresholdDb: -48,
        minStripMs: 120,
        minSilenceMs: 120,
        startPadMs: 5,
        endPadMs: 20,
      },
      aiConfig: {
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        timeoutSeconds: 30,
        apiKey: '',
        prompt: 'test',
      },
      ui: {
        analyzeCacheEnabled: true,
        stripAfterImport: true,
        autoSaveSession: true,
        importAudioMode: 'copy',
        deleteIxmlIfPresent: false,
        fadeAfterStrip: false,
        fadePresetName: '',
        fadeAutoAdjustBounds: true,
      },
    },
    2: [
      {
        filePath: '/Imports/Drums/kick.wav',
        categoryId: 'drums',
        aiName: 'Kick In',
        finalName: 'Kick In',
        status: 'ready',
        errorMessage: null,
        hasIxml: true,
      },
    ],
    3: ['/Imports/Drums'],
    4: 3,
    5: false,
  })

  try {
    const tree = pageModule.ImportWorkflowPage({
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    })
    const markup = renderToStaticMarkup(tree)

    assert.doesNotMatch(markup, /Import audio mode/)
    assert.doesNotMatch(markup, /Copy into Audio Files folder/)
    assert.doesNotMatch(markup, /Link to source media/)
    assert.doesNotMatch(markup, /Delete iXML sidecar files after import/)
  } finally {
    restore()
  }
})

test('main page applies category changes to all selected rows when editing one selected file', async () => {
  const initialRows = [
    {
      filePath: '/Imports/Drums/kick.wav',
      categoryId: 'drums',
      aiName: 'Kick In',
      finalName: 'Kick In',
      status: 'ready',
      errorMessage: null,
    },
    {
      filePath: '/Imports/Drums/snare.wav',
      categoryId: 'drums',
      aiName: 'Snare Top',
      finalName: 'Snare Top',
      status: 'ready',
      errorMessage: null,
    },
  ]
  const selectedPaths = new Set(initialRows.map((row) => row.filePath))
  const { pageModule, stateUpdates, restore } = await loadPageModuleWithHookHarness({
    1: {
      categories: [
        { id: 'drums', name: 'Drums', colorSlot: 3, previewHex: '#111111' },
        { id: 'fx', name: 'FX', colorSlot: 33, previewHex: '#333333' },
      ],
      silenceProfile: {
        thresholdDb: -48,
        minStripMs: 120,
        minSilenceMs: 120,
        startPadMs: 5,
        endPadMs: 20,
      },
      aiConfig: {
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        timeoutSeconds: 30,
        apiKey: '',
        prompt: 'test',
      },
      ui: {
        analyzeCacheEnabled: true,
        stripAfterImport: true,
        autoSaveSession: true,
        importAudioMode: 'copy',
        deleteIxmlIfPresent: false,
        fadeAfterStrip: false,
        fadePresetName: '',
        fadeAutoAdjustBounds: true,
      },
    },
    2: initialRows,
    3: ['/Imports/Drums'],
    4: 1,
    5: false,
    8: selectedPaths,
    9: initialRows[0].filePath,
  })

  try {
    const tree = pageModule.ImportWorkflowPage({
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    })
    const categorySelect = findElement(
      tree,
      (node) => typeof node.type === 'function' && node.props?.['aria-label'] === 'Category' && node.props?.value === 'drums',
    )

    assert.ok(categorySelect, 'expected category select in prepared file table')

    categorySelect.props.onChange({ target: { value: 'fx' } })

    const nextRows = resolveLatestStateValue(stateUpdates, 2, initialRows)
    assert.deepEqual(
      nextRows.map((row) => row.categoryId),
      ['fx', 'fx'],
    )
  } finally {
    restore()
  }
})

test('main page keeps multi-selection when clicking interactive cells in the prepared file list', async () => {
  const initialRows = [
    {
      filePath: '/Imports/Drums/kick.wav',
      categoryId: 'drums',
      aiName: 'Kick In',
      finalName: 'Kick In',
      status: 'ready',
      errorMessage: null,
    },
    {
      filePath: '/Imports/Drums/snare.wav',
      categoryId: 'drums',
      aiName: 'Snare Top',
      finalName: 'Snare Top',
      status: 'ready',
      errorMessage: null,
    },
  ]
  const initialSelectedPaths = new Set(initialRows.map((row) => row.filePath))
  const { pageModule, stateUpdates, restore } = await loadPageModuleWithHookHarness({
    1: {
      categories: [
        { id: 'drums', name: 'Drums', colorSlot: 3, previewHex: '#111111' },
        { id: 'fx', name: 'FX', colorSlot: 33, previewHex: '#333333' },
      ],
      silenceProfile: {
        thresholdDb: -48,
        minStripMs: 120,
        minSilenceMs: 120,
        startPadMs: 5,
        endPadMs: 20,
      },
      aiConfig: {
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        timeoutSeconds: 30,
        apiKey: '',
        prompt: 'test',
      },
      ui: {
        analyzeCacheEnabled: true,
        stripAfterImport: true,
        autoSaveSession: true,
        importAudioMode: 'copy',
        deleteIxmlIfPresent: false,
        fadeAfterStrip: false,
        fadePresetName: '',
        fadeAutoAdjustBounds: true,
      },
    },
    2: initialRows,
    3: ['/Imports/Drums'],
    4: 1,
    5: false,
    8: initialSelectedPaths,
    9: initialRows[0].filePath,
  })

  try {
    const tree = pageModule.ImportWorkflowPage({
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    })
    const categoryCell = findElement(
      tree,
      (node) => node.type === 'td' && node.props?.['data-row-selection-ignore'] === 'true',
    )

    assert.ok(categoryCell, 'expected interactive prepared file cell')
    assert.equal(typeof categoryCell.props?.onMouseDown, 'undefined')

    const nextSelectedPaths = resolveLatestStateValue(stateUpdates, 8, initialSelectedPaths)
    assert.deepEqual([...nextSelectedPaths], [...initialSelectedPaths])
  } finally {
    restore()
  }
})

test('main page still updates row selection when clicking non-interactive row area', async () => {
  const initialRows = [
    {
      filePath: '/Imports/Drums/kick.wav',
      categoryId: 'drums',
      aiName: 'Kick In',
      finalName: 'Kick In',
      status: 'ready',
      errorMessage: null,
    },
    {
      filePath: '/Imports/Drums/snare.wav',
      categoryId: 'drums',
      aiName: 'Snare Top',
      finalName: 'Snare Top',
      status: 'ready',
      errorMessage: null,
    },
  ]
  const initialSelectedPaths = new Set(initialRows.map((row) => row.filePath))
  const { pageModule, stateUpdates, restore } = await loadPageModuleWithHookHarness({
    1: {
      categories: [
        { id: 'drums', name: 'Drums', colorSlot: 3, previewHex: '#111111' },
        { id: 'fx', name: 'FX', colorSlot: 33, previewHex: '#333333' },
      ],
      silenceProfile: {
        thresholdDb: -48,
        minStripMs: 120,
        minSilenceMs: 120,
        startPadMs: 5,
        endPadMs: 20,
      },
      aiConfig: {
        enabled: true,
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4.1-mini',
        timeoutSeconds: 30,
        apiKey: '',
        prompt: 'test',
      },
      ui: {
        analyzeCacheEnabled: true,
        stripAfterImport: true,
        autoSaveSession: true,
        importAudioMode: 'copy',
        deleteIxmlIfPresent: false,
        fadeAfterStrip: false,
        fadePresetName: '',
        fadeAutoAdjustBounds: true,
      },
    },
    2: initialRows,
    3: ['/Imports/Drums'],
    4: 1,
    5: false,
    8: initialSelectedPaths,
    9: initialRows[0].filePath,
  })

  try {
    const tree = pageModule.ImportWorkflowPage({
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    })
    const selectableCell = findElement(
      tree,
      (node) => node.type === 'td' && node.props?.className === 'iw-table-cell iw-table-cell--file',
    )

    assert.ok(selectableCell, 'expected non-interactive prepared file cell with selection handler')
    assert.equal(typeof selectableCell.props?.onMouseDown, 'function')

    selectableCell.props.onMouseDown({
      target: {
        closest() {
          return null
        },
      },
      metaKey: false,
      ctrlKey: false,
      shiftKey: false,
    })

    const nextSelectedPaths = resolveLatestStateValue(stateUpdates, 8, initialSelectedPaths)
    assert.deepEqual([...nextSelectedPaths], [initialRows[0].filePath])
  } finally {
    restore()
  }
})

test('main page does not render a plugin logs panel', async () => {
  const pluginModule = await loadPluginModule()
  const markup = renderToStaticMarkup(
    React.createElement(pluginModule.ImportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /Analyze and edit/)
  assert.match(markup, /Strip setup/)
  assert.match(markup, /Run import/)
  assert.doesNotMatch(markup, /iw-title/)
  assert.doesNotMatch(markup, /Session overview/)
  assert.doesNotMatch(markup, /Select a folder or audio files to begin\./)
  assert.doesNotMatch(markup, /Logs/)
  assert.doesNotMatch(markup, /No log entries yet\./)
  assert.match(markup, /Pending/)
  assert.match(markup, /Ready/)
  assert.match(markup, /Failed/)
  assert.match(markup, /Skipped/)
  assert.match(markup, /Prepared files/)
  assert.doesNotMatch(markup, /Batch edit/)
  assert.match(markup, /Browse/)
  assert.doesNotMatch(markup, /Scan folder/)
  assert.match(markup, /Run AI analyze/)
  assert.match(markup, /Clear/)
  assert.match(markup, />Previous</)
  assert.match(markup, />Next: Strip setup</)
  assert.doesNotMatch(markup, />Back</)
  assert.doesNotMatch(markup, />Next</)
  assert.doesNotMatch(markup, /Column display/)
  assert.doesNotMatch(markup, /File width/)
  assert.doesNotMatch(markup, /Status width/)
  assert.doesNotMatch(markup, /Open Strip Silence/)
  assert.doesNotMatch(markup, /Execution uses public capabilities only/)
  assert.ok(markup.indexOf('iw-stepper') < markup.indexOf('Prepared files'))
  assert.ok(markup.indexOf('Prepared files') < markup.indexOf('Browse'))
})

test('main page step 1 removes source-folder textarea and keeps browse-only folder picking contract', async () => {
  const pluginModule = await loadPluginModule()
  const markup = renderToStaticMarkup(
    React.createElement(pluginModule.ImportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /Source folders/)
  assert.doesNotMatch(markup, /iw-source-folders/)
  assert.match(markup, /Browse/)
  assert.doesNotMatch(markup, /Scan folder/)
})

test('main page uses browse to pick folders and auto-runs import analyze with selected folders', async () => {
  const { pageModule, restore } = await loadPageModuleWithHookHarness()
  const pickFolderCalls = []
  const analyzeCalls = []
  const selectedFolders = ['/Imports/A', '/Imports/B']
  const testContext = createPluginContext()
  testContext.presto.import.analyze = async (payload) => {
    analyzeCalls.push(payload)
    return {
      folderPaths: payload.sourceFolders,
      orderedFilePaths: [],
      rows: [],
      cache: { files: 0, hits: 0 },
    }
  }

  try {
    const tree = pageModule.ImportWorkflowPage({
      context: testContext,
      host: {
        pickFolder: async () => {
          pickFolderCalls.push('called')
          return {
            canceled: false,
            paths: selectedFolders,
          }
        },
      },
      params: {},
      searchParams: new URLSearchParams(),
    })

    const browseButton = findElement(
      tree,
      (node) => typeof node.type === 'function' && getElementText(node.props?.children) === 'Browse',
    )

    assert.ok(browseButton, 'expected import step 1 to render a Browse action')

    await browseButton.props.onClick()
    assert.equal(pickFolderCalls.length, 1)
    assert.equal(analyzeCalls.length, 1)
    assert.deepEqual(analyzeCalls[0]?.sourceFolders, selectedFolders)
  } finally {
    restore()
  }
})

test('main page browse cancel does not analyze or mutate selected source folders', async () => {
  const { pageModule, stateUpdates, restore } = await loadPageModuleWithHookHarness()
  const pickFolderCalls = []
  const analyzeCalls = []
  const canceledSelection = ['/Canceled/Selection']
  const testContext = createPluginContext()
  testContext.presto.import.analyze = async (payload) => {
    analyzeCalls.push(payload)
    return {
      folderPaths: payload.sourceFolders,
      orderedFilePaths: [],
      rows: [],
      cache: { files: 0, hits: 0 },
    }
  }

  try {
    const tree = pageModule.ImportWorkflowPage({
      context: testContext,
      host: {
        pickFolder: async () => {
          pickFolderCalls.push('called')
          return {
            canceled: true,
            paths: canceledSelection,
          }
        },
      },
      params: {},
      searchParams: new URLSearchParams(),
    })

    const browseButton = findElement(
      tree,
      (node) => typeof node.type === 'function' && getElementText(node.props?.children) === 'Browse',
    )

    assert.ok(browseButton, 'expected import step 1 to render a Browse action')

    await browseButton.props.onClick()
    assert.equal(pickFolderCalls.length, 1)
    assert.equal(analyzeCalls.length, 0)
    assert.equal(hasFolderSelectionUpdate(stateUpdates, canceledSelection), false)
  } finally {
    restore()
  }
})

test('main page browse analyze failure does not replace the current source-folder selection', async () => {
  const { pageModule, stateUpdates, restore } = await loadPageModuleWithHookHarness()
  const selectedFolders = ['/Imports/Failed']
  const analyzeCalls = []
  const testContext = createPluginContext()
  testContext.presto.import.analyze = async (payload) => {
    analyzeCalls.push(payload)
    throw new Error('analyze failed')
  }

  try {
    const tree = pageModule.ImportWorkflowPage({
      context: testContext,
      host: {
        pickFolder: async () => ({
          canceled: false,
          paths: selectedFolders,
        }),
      },
      params: {},
      searchParams: new URLSearchParams(),
    })

    const browseButton = findElement(
      tree,
      (node) => typeof node.type === 'function' && getElementText(node.props?.children) === 'Browse',
    )

    assert.ok(browseButton, 'expected import step 1 to render a Browse action')

    await browseButton.props.onClick()
    assert.equal(analyzeCalls.length, 1)
    assert.equal(hasFolderSelectionUpdate(stateUpdates, selectedFolders), false)
  } finally {
    restore()
  }
})

test('main page normalizes structured workflow start errors instead of storing object string output', async () => {
  const { pageModule, stateUpdates, restore } = await loadPageModuleWithHookHarness({
    2: [
      {
        filePath: '/Imports/Drums/kick.wav',
        categoryId: 'drums',
        aiName: 'Kick',
        finalName: 'Kick',
        status: 'ready',
        errorMessage: null,
      },
    ],
    3: ['/Imports/Drums'],
    4: 3,
    5: false,
  })
  const structuredError = {
    message: 'workflow start failed',
    code: 'workflow_start_failed',
  }
  const testContext = createPluginContext()
  testContext.presto.workflow.run.start = async () => {
    throw structuredError
  }

  try {
    const tree = pageModule.ImportWorkflowPage({
      context: testContext,
      params: {},
      searchParams: new URLSearchParams(),
    })

    const runButton = findElement(
      tree,
      (node) => typeof node.type === 'function' && getElementText(node.props?.children) === 'Run import',
    )

    assert.ok(runButton, 'expected import step 3 to render a Run import action')

    runButton.props.onClick()
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.ok(
      stateUpdates.some((update) => update.index === 7 && update.value === 'workflow start failed'),
      'expected structured errors to write a readable inline error message',
    )
    assert.ok(
      stateUpdates.some(
        (update) =>
          update.index === 12 &&
          update.value &&
          typeof update.value === 'object' &&
          update.value.phase === 'failed' &&
          update.value.message === 'workflow start failed',
      ),
      'expected structured errors to write a readable run-state message',
    )
    assert.equal(
      stateUpdates.some((update) => update.value === '[object Object]'),
      false,
      'expected no state update to store the raw object string output',
    )
  } finally {
    restore()
  }
})

test('main page maps backend workflow phase updates onto the matching progress stage', async () => {
  const { pageModule, stateUpdates, restore } = await loadPageModuleWithHookHarness({
    2: [
      {
        filePath: '/Imports/Drums/kick.wav',
        categoryId: 'drums',
        aiName: 'Kick In',
        finalName: 'Kick In',
        status: 'ready',
        errorMessage: null,
      },
      {
        filePath: '/Imports/Drums/snare.wav',
        categoryId: 'drums',
        aiName: 'Snare Top',
        finalName: 'Snare Top',
        status: 'ready',
        errorMessage: null,
      },
    ],
    3: ['/Imports/Drums'],
    4: 3,
    5: false,
  })
  const testContext = createPluginContext()
  let pollCount = 0
  testContext.presto.workflow.run.start = async () => ({ jobId: 'job-progress', capability: 'workflow.run.start', state: 'queued' })
  testContext.presto.jobs.get = async () => {
    pollCount += 1
    if (pollCount === 1) {
      return {
        state: 'running',
        progress: {
          phase: 'rename',
          current: 0,
          total: 2,
          percent: 0,
          message: 'Renaming tracks.',
        },
      }
    }
    return {
      state: 'succeeded',
      progress: {
        phase: 'succeeded',
        current: 6,
        total: 6,
        percent: 100,
        message: 'Workflow completed.',
      },
    }
  }

  try {
    const tree = pageModule.ImportWorkflowPage({
      context: testContext,
      params: {},
      searchParams: new URLSearchParams(),
    })

    const runButton = findElement(
      tree,
      (node) => typeof node.type === 'function' && getElementText(node.props?.children) === 'Run import',
    )

    assert.ok(runButton, 'expected import step 3 to render a Run import action')

    runButton.props.onClick()
    await new Promise((resolve) => setTimeout(resolve, 0))

    assert.ok(
      stateUpdates.some(
        (update) =>
          update.value &&
          typeof update.value === 'object' &&
          update.value.phase === 'backend' &&
          update.value.stageKey === 'rename' &&
          update.value.total === 2,
      ),
      'expected backend rename phase to map onto the rename progress stage',
    )
  } finally {
    restore()
  }
})

test('main page renders localized strings through plugin-local locale messages', async () => {
  const pluginModule = await loadPluginModule()
  const localizedContext = {
    ...createPluginContext(),
    locale: {
      requested: 'zh-CN',
      resolved: 'zh-CN',
    },
  }
  const markup = renderToStaticMarkup(
    React.createElement(pluginModule.ImportWorkflowPage, {
      context: localizedContext,
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /草稿概览/)
  assert.match(markup, /待导入文件/)
  assert.match(markup, /分析与编辑/)
})

test('settings schema does not expose log display preferences', async () => {
  const pluginModule = await loadPluginModule()
  const serialized = JSON.stringify(pluginModule.manifest.settingsPages)
  assert.doesNotMatch(serialized, /Collapse logs by default/)
})

test('main page can render Simplified Chinese through plugin-local locale messages', async () => {
  const pluginModule = await loadPluginModule()
  const markup = renderToStaticMarkup(
    React.createElement(pluginModule.ImportWorkflowPage, {
      context: {
        ...createPluginContext(),
        locale: {
          requested: 'zh-CN',
          resolved: 'zh-CN',
        },
      },
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /分析与编辑/)
  assert.match(markup, /草稿概览/)
  assert.match(markup, /待导入文件/)
  assert.match(markup, /浏览/)
  assert.match(markup, /浏览文件夹后开始扫描/)
  assert.match(markup, /下一步：Strip 设置/)
})

test('settings schema keeps AI naming and category editor semantics while page CSS stays single-column', async () => {
  const [entrySource, cssSource] = await Promise.all([
    readFile(new URL('../dist/entry.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/import-workflow.css', import.meta.url), 'utf8'),
  ])

  assert.match(entrySource, /title:\s*'AI naming'/)
  assert.match(entrySource, /kind:\s*'categoryList'/)
  assert.match(cssSource, /\.iw-settings-grid[\s\S]*grid-template-columns:\s*1fr/)
})

test('workflow page keeps bottom actions pinned while main content scrolls within page height', async () => {
  const pluginModule = await loadPluginModule()
  const [pageSource, cssSource] = await Promise.all([
    readFile(new URL('../dist/ImportWorkflowPage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/import-workflow.css', import.meta.url), 'utf8'),
  ])
  const markup = renderToStaticMarkup(
    React.createElement(pluginModule.ImportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(pageSource, /className:\s*'iw-main[^']*'/)
  assert.match(pageSource, /WorkflowActionBar/)
  assert.match(pageSource, /align:\s*'space-between'/)
  assert.match(markup, /class="iw-main[^"]*"[\s\S]*class="(?:iw-action-bar presto-workflow-action-bar|presto-workflow-action-bar iw-action-bar)[^"]*"/)
  assert.match(markup, /presto-workflow-action-bar__inner presto-workflow-action-bar__inner--space-between/)
  assert.match(cssSource, /\.iw-shell[\s\S]*display:\s*grid[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto[\s\S]*height:\s*100%/)
  assert.match(cssSource, /\.iw-main[\s\S]*overflow:\s*auto[\s\S]*min-height:\s*0/)
  assert.match(cssSource, /\.iw-action-bar[\s\S]*background:\s*transparent/)
  assert.match(cssSource, /\.iw-action-bar-inner[\s\S]*justify-content:\s*space-between/)
})

test('workflow action bar reflows on narrow windows instead of forcing horizontal overflow', async () => {
  const cssSource = await readFile(new URL('../dist/import-workflow.css', import.meta.url), 'utf8')

  assert.match(cssSource, /@media \(max-width:\s*640px\)[\s\S]*\.iw-action-bar-inner[\s\S]*flex-wrap:\s*wrap/)
  assert.match(cssSource, /@media \(max-width:\s*640px\)[\s\S]*\.iw-action-bar-inner > \*[\s\S]*flex:\s*1 1 140px/)
  assert.match(cssSource, /@media \(max-width:\s*640px\)[\s\S]*\.iw-action-bar[\s\S]*padding:\s*10px 16px/)
})

test('main page source removes the checkbox column and table configuration ui while declarative settings stay schema-only', async () => {
  const [pageSource, entrySource, cssSource] = await Promise.all([
    readFile(new URL('../dist/ImportWorkflowPage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/entry.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/import-workflow.css', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(pageSource, /id:\s*'selected'/)
  assert.doesNotMatch(pageSource, /h\('th', null, ''\)/)
  assert.doesNotMatch(pageSource, /iw-table-config/)
  assert.doesNotMatch(pageSource, /updatePreparedColumnVisibility/)
  assert.doesNotMatch(pageSource, /updatePreparedColumnWidth/)
  assert.doesNotMatch(pageSource, /Threshold/)
  assert.doesNotMatch(pageSource, /Add audio files/)
  assert.doesNotMatch(pageSource, /Start import/)
  assert.match(pageSource, /host\.pickFolder\(\)/)
  assert.match(pageSource, /page\.button\.browse/)
  assert.match(pageSource, /pluginId:\s*context\.pluginId/)
  assert.match(pageSource, /workflowId:\s*IMPORT_WORKFLOW_ID/)
  assert.doesNotMatch(pageSource, /definition:\s*workflowDefinition/)
  assert.match(pageSource, /sourceFolders/)
  assert.match(pageSource, /orderedFilePaths/)
  assert.match(pageSource, /rows:\s*sortedRows/)
  assert.match(pageSource, /persistCache\(next\)/)
  assert.match(entrySource, /kind:\s*'categoryList'/)
  assert.match(pageSource, /return next/)
  assert.doesNotMatch(pageSource, /const sorted = sortRowsForDisplay\(next, settings\.categories\)/)
  assert.match(pageSource, /page\.meta\.stage/)
  assert.match(pageSource, /page\.meta\.items/)
  assert.match(pageSource, /page\.meta\.job/)
  assert.match(pageSource, /page\.job\.na/)
  assert.doesNotMatch(pageSource, /Progress:\s*\$\{runState\.current\}\/\$\{runState\.total \|\| 0\}/)
  assert.match(entrySource, /title:\s*'AI naming'/)
  assert.match(entrySource, /title:\s*'Run defaults'/)
  assert.match(entrySource, /title:\s*'Categories and colors'/)
  assert.match(entrySource, /kind:\s*'categoryList'/)
  assert.doesNotMatch(entrySource, /ImportWorkflowSettingsPage/)
  assert.match(cssSource, /\.iw-settings-grid[\s\S]*grid-template-columns:\s*1fr/)
  assert.match(cssSource, /\.iw-form-stack[\s\S]*grid-template-columns:\s*1fr/)
  assert.match(cssSource, /\.iw-table-wrap[\s\S]*user-select:\s*none/)
  assert.match(cssSource, /\.iw-table-wrap--prepared[\s\S]*max-height:/)
  assert.match(cssSource, /\.iw-table-wrap input,[\s\S]*user-select:\s*text/)
  assert.match(pageSource, /className:\s*'iw-main iw-main--workflow'/)
  assert.match(pageSource, /className:\s*'iw-action-bar--workflow'/)
  assert.match(cssSource, /\.iw-shell[\s\S]*min-height:\s*0/)
  assert.match(cssSource, /\.iw-main--workflow[\s\S]*overflow:\s*auto/)
  assert.match(pageSource, /align:\s*'space-between'/)
  assert.match(cssSource, /\.iw-action-bar--workflow[\s\S]*padding-top:\s*14px/)
  assert.match(cssSource, /\.iw-stepper-row[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(cssSource, /\.iw-file-path[\s\S]*text-overflow:\s*ellipsis/)
  assert.match(pageSource, /WorkflowSelect/)
  assert.doesNotMatch(pageSource, /h\(\s*'select'/)
})

test('prepared rows category column reuses shared select styling instead of native import select markup', async () => {
  const { pageModule, restore } = await loadPageModuleWithHookHarness({
    2: [
      {
        filePath: '/Imports/Drums/kick.wav',
        categoryId: 'drums',
        aiName: 'Kick',
        finalName: 'Kick',
        status: 'ready',
        errorMessage: null,
      },
    ],
    3: ['/Imports/Drums'],
    5: false,
  })

  try {
    const markup = renderToStaticMarkup(
      React.createElement(pageModule.ImportWorkflowPage, {
        context: createPluginContext(),
        params: {},
        searchParams: new URLSearchParams(),
      }),
    )

    assert.match(markup, /ui-select/)
    assert.doesNotMatch(markup, /<select class="iw-select"/)
  } finally {
    restore()
  }
})
