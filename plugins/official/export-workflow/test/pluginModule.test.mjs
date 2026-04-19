import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let pluginModulePromise = null

function createSharedUiMock() {
  return {
    Select({ label, options = [], className, children, selectProps: _selectProps, startAdornment: _startAdornment, endAdornment: _endAdornment, ...props }) {
      let previousGroup = ''
      const optionNodes =
        children ??
        options.flatMap((option) => {
          const nodes = []
          if (option.group && option.group !== previousGroup) {
            previousGroup = option.group
            nodes.push(
              React.createElement('optgroup', {
                key: `group:${option.group}`,
                label: option.group,
              }),
            )
          }
          nodes.push(React.createElement('option', { key: option.value, value: option.value }, option.label))
          return nodes
        })
      return React.createElement(
        'label',
        { className: ['ui-select', className].filter(Boolean).join(' ') },
        label ? React.createElement('span', null, label) : null,
        React.createElement(
          'select',
          props,
          optionNodes,
        ),
      )
    },
  }
}

function createSampleSnapshot(overrides = {}) {
  return {
    id: 'snapshot-1',
    name: 'Verse Lead',
    trackStates: [
      {
        trackId: 'track-1',
        trackName: 'Lead Vox',
        is_soloed: true,
        is_muted: false,
        type: 'audio',
        color: '#ff4a90e2',
      },
    ],
    createdAt: '2026-03-25T00:00:00.000Z',
    updatedAt: '2026-03-25T00:00:00.000Z',
    ...overrides,
  }
}

function createRunningJobView(overrides = {}) {
  return {
    jobId: 'job-1',
    state: 'running',
    terminalStatus: 'running',
    progressPercent: 42,
    message: 'Exporting snapshot 1 of 1',
    currentSnapshot: 1,
    totalSnapshots: 1,
    currentSnapshotName: 'Verse Lead',
    currentMixSourceName: 'Ref Print (Stereo)',
    currentMixSourceIndex: 1,
    totalMixSources: 2,
    currentFileProgressPercent: 58,
    overallProgressPercent: 42,
    etaSeconds: 18,
    exportedCount: 0,
    lastExportedFile: '',
    exportedFiles: [],
    failedSnapshots: [],
    success: false,
    errorMessage: '',
    isTerminal: false,
    ...overrides,
  }
}

function createPluginContext() {
  return {
    pluginId: 'official.export-workflow',
    locale: {
      requested: 'en',
      resolved: 'en',
    },
    presto: {
      workflow: {
        run: {
          start: async () => ({ jobId: 'job-1', capability: 'workflow.run.start', state: 'queued' }),
        },
      },
      daw: {
        connection: {
          getStatus: async () => ({ connected: false }),
        },
      },
      session: {
        getInfo: async () => ({
          session: {
            sessionName: 'Demo Session',
            sessionPath: '/Sessions/Demo Session.ptx',
            sampleRate: 48000,
            bitDepth: 24,
          },
        }),
      },
      track: {
        list: async () => ({ tracks: [] }),
      },
      export: {
        mixSource: {
          list: async ({ sourceType }) => ({
            sourceType,
            sourceList:
              sourceType === 'physicalOut'
                ? [
                    'Music (Stereo)',
                    'All BV (Stereo)',
                    'All BV.L (Mono)',
                    'All BV.R (Mono)',
                    'LV SC (Mono)',
                  ]
                : ['Ref Print (Stereo)'],
          }),
        },
      },
      jobs: {
        get: async () => ({
          jobId: 'job-1',
          state: 'queued',
          progress: { percent: 0, current: 0, total: 1, message: 'queued' },
          metadata: {},
          result: {},
        }),
        cancel: async () => ({ cancelled: true, jobId: 'job-1' }),
      },
    },
    runtime: {
      dialog: {
        openFolder: async () => ({ canceled: true, paths: [] }),
      },
      mobileProgress: {
        createSession: async () => ({ ok: true, sessionId: 'mob-1', url: 'http://127.0.0.1:43123/mobile-progress/mob-1?token=test-token', qrSvg: '<svg></svg>' }),
        closeSession: async () => ({ ok: true }),
        getViewUrl: async () => ({ ok: true, sessionId: 'mob-1', url: 'http://127.0.0.1:43123/mobile-progress/mob-1?token=test-token', qrSvg: '<svg></svg>' }),
        updateSession: async () => ({ ok: true, sessionId: 'mob-1', updatedAt: '2026-03-28T10:00:00.000Z' }),
      },
      fs: {
        readFile: async () => null,
        writeFile: async () => {},
        ensureDir: async () => {},
        getHomePath: async () => '/Users/test',
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

async function loadPageModuleWithStateOverrides(overrides) {
  const previousWindow = globalThis.window
  const originalUseState = React.useState
  let stateCallIndex = 0

  React.useState = (initialValue) => {
    stateCallIndex += 1
    if (Object.prototype.hasOwnProperty.call(overrides, stateCallIndex)) {
      return originalUseState(overrides[stateCallIndex])
    }
    return originalUseState(initialValue)
  }

  globalThis.window = {
    __PRESTO_PLUGIN_SHARED__: {
      React,
      ui: createSharedUiMock(),
    },
  }

  try {
    const pageUrl = new URL('../dist/ExportWorkflowPage.mjs', import.meta.url)
    pageUrl.searchParams.set('test', String(Date.now()))
    pageUrl.searchParams.set('scenario', Math.random().toString(36).slice(2))
    return await import(pageUrl.href)
  } finally {
    React.useState = originalUseState
    if (previousWindow === undefined) {
      delete globalThis.window
    } else {
      globalThis.window = previousWindow
    }
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
    const pageUrl = new URL('../dist/ExportWorkflowPage.mjs', import.meta.url)
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
  return findElement(node?.props?.children, predicate)
}

test('plugin module exports manifest and page export', async () => {
  const pluginModule = await loadPluginModule()
  assert.equal(pluginModule.manifest.pluginId, 'official.export-workflow')
  assert.equal(pluginModule.manifest.entry, 'dist/entry.mjs')
  assert.equal(pluginModule.manifest.styleEntry, 'dist/export-workflow.css')
  assert.equal(pluginModule.manifest.pages[0]?.componentExport, 'ExportWorkflowPage')
  assert.equal(pluginModule.manifest.pages[0]?.mount, 'workspace')
  assert.equal(pluginModule.manifest.workflowDefinition?.workflowId, 'official.export-workflow.run')
  assert.equal(pluginModule.manifest.workflowDefinition?.definitionEntry, 'dist/workflow-definition.json')
  assert.equal(pluginModule.manifest.pages.length, 1)
  assert.equal('navigationItems' in pluginModule.manifest, false)
  assert.equal('commands' in pluginModule.manifest, false)
  assert.equal(pluginModule.manifest.settingsPages[0]?.pageId, 'export-workflow.page.settings')
  assert.equal(pluginModule.manifest.settingsPages[0]?.loadExport, 'loadExportWorkflowSettings')
  assert.equal(pluginModule.manifest.settingsPages[0]?.saveExport, 'saveExportWorkflowSettings')
  assert.equal(typeof pluginModule.activate, 'function')
  assert.equal(typeof pluginModule.ExportWorkflowPage, 'function')
  assert.equal(typeof pluginModule.loadExportWorkflowSettings, 'function')
  assert.equal(typeof pluginModule.saveExportWorkflowSettings, 'function')
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
      (item) => item.moduleId === 'export' && item.minVersion === '2025.10.0',
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
  assert.equal(fileManifest.requiredRuntimeServices, undefined)
  assert.equal(pluginModule.manifest.requiredRuntimeServices, undefined)
  assert.deepEqual(fileManifest.settingsPages, pluginModule.manifest.settingsPages)
})

test('dist modules resolve React through a plugin-local shared helper', async () => {
  const [pageSource, entrySource, uiSource, helperSource] = await Promise.all([
    readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/entry.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/ui.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/react-shared.mjs', import.meta.url), 'utf8'),
  ])

  assert.doesNotMatch(pageSource, /from ['"]react['"]/)
  assert.doesNotMatch(uiSource, /from ['"]react['"]/)
  assert.match(pageSource, /react-shared\.mjs/)
  assert.doesNotMatch(pageSource, /workflow-definition\.mjs/)
  assert.doesNotMatch(entrySource, /ExportWorkflowSettingsPage/)
  assert.doesNotMatch(entrySource, /workflow-definition\.mjs/)
  assert.match(uiSource, /react-shared\.mjs/)
  assert.match(helperSource, /__PRESTO_PLUGIN_SHARED__/)
})

test('settings schema keeps the implemented export workflow controls', async () => {
  const pluginModule = await loadPluginModule()
  const settingsPage = pluginModule.manifest.settingsPages[0]

  assert.equal(settingsPage.sections.length, 1)
  assert.equal(settingsPage.sections[0]?.title, 'Default snapshot selection')
  assert.equal(settingsPage.sections[0]?.fields[0]?.path, 'defaultSnapshotSelection')
  assert.equal(settingsPage.sections[0]?.fields[0]?.kind, 'toggle')
  assert.equal(settingsPage.sections[0]?.fields[0]?.checkedValue, 'all')
  assert.equal(settingsPage.sections[0]?.fields[0]?.uncheckedValue, 'none')
})

test('main page can render Simplified Chinese through plugin-local locale messages', async () => {
  const pluginModule = await loadPluginModule()
  const markup = renderToStaticMarkup(
    React.createElement(pluginModule.ExportWorkflowPage, {
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

  assert.match(markup, /工程与轨道/)
  assert.match(markup, /工程/)
  assert.match(markup, /轨道列表/)
})

test('step 3 preview label uses Chinese for generic zh locale variants', async () => {
  const idleModule = await loadPageModuleWithStateOverrides({
    1: 3,
    2: {
      loading: false,
      connected: true,
      session: {
        sessionName: 'Demo Session',
        sessionPath: '/Sessions/Demo Session.ptx',
        sampleRate: 48000,
        bitDepth: 24,
      },
      tracks: [],
      error: '',
    },
    4: [createSampleSnapshot()],
    5: ['snapshot-1'],
    10: {
      file_format: 'wav',
      mix_sources: [{ name: 'Ref Print', type: 'physicalOut' }],
      online_export: false,
      file_name_template: '{session}_{snapshot}{source_suffix}',
      output_path: '/Exports',
    },
    32: {
      physicalOut: ['Ref Print'],
      bus: [],
      output: [],
      renderer: [],
    },
  })
  const markup = renderToStaticMarkup(
    React.createElement(idleModule.ExportWorkflowPage, {
      context: {
        ...createPluginContext(),
        locale: {
          requested: 'zh',
          resolved: 'zh',
        },
      },
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /文件名预览/)
  assert.doesNotMatch(markup, /File Name Preview/)
})

test('step 3 preview keeps Chinese literal text in the rendered file name', async () => {
  const idleModule = await loadPageModuleWithStateOverrides({
    1: 3,
    2: {
      loading: false,
      connected: true,
      session: {
        sessionName: 'Demo Session',
        sessionPath: '/Sessions/Demo Session.ptx',
        sampleRate: 48000,
        bitDepth: 24,
      },
      tracks: [],
      error: '',
    },
    4: [createSampleSnapshot({ name: '主歌' })],
    5: ['snapshot-1'],
    10: {
      file_format: 'wav',
      mix_sources: [{ name: 'Ref Print', type: 'physicalOut' }],
      online_export: false,
      file_name_template: '{sample_rate}_{snapshot}_了',
      output_path: '/Exports',
    },
    32: {
      physicalOut: ['Ref Print'],
      bus: [],
      output: [],
      renderer: [],
    },
  })
  const markup = renderToStaticMarkup(
    React.createElement(idleModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /48000_主歌_了\.wav/)
})

test('main page renders the formal three-step export workflow shell', async () => {
  const pluginModule = await loadPluginModule()
  const markup = renderToStaticMarkup(
    React.createElement(pluginModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.doesNotMatch(markup, /Export Workflow/)
  assert.match(markup, /Session \+ tracks/)
  assert.match(markup, /Snapshots/)
  assert.match(markup, /Export settings/)
  assert.match(markup, /Session/)
  assert.match(markup, /Track list/)
  assert.match(markup, /Next: Snapshots/)
  assert.match(markup, /class="ew-stepper"/)
  assert.match(markup, /class="ew-stepper-row"/)
  assert.match(markup, /class="ew-step"/)
  assert.match(markup, /ew-step-shell ew-step-shell--session/)
  assert.match(markup, /ew-block-card ew-block-card--session/)
  assert.match(markup, /ew-block-card ew-block-card--tracks/)
  assert.match(markup, /class="ew-shell"/)
  assert.match(markup, /class="ew-main ew-main--workflow"/)
  assert.match(markup, /class="(?:ew-action-bar presto-workflow-action-bar|presto-workflow-action-bar ew-action-bar)"/)
  assert.match(markup, /presto-workflow-action-bar__inner presto-workflow-action-bar__inner--space-between/)
  assert.match(markup, /class="ew-action-slot" aria-hidden="true"><\/span>/)
  assert.doesNotMatch(markup, /Sample rate/)
  assert.doesNotMatch(markup, /Bit depth/)
  assert.doesNotMatch(markup, />Section</)
  assert.match(markup, /ew-table-wrap ew-table-wrap--tracks/)
  assert.match(markup, /class="ew-table"/)
  assert.match(markup, />Track Info<\/th>/)
  assert.match(markup, />Type<\/th>/)
  assert.match(markup, />Status<\/th>/)
})

test('session overview stays compact when live session metadata is available', async () => {
  const pageModule = await loadPageModuleWithStateOverrides({
    2: {
      loading: false,
      connected: true,
      session: {
        sessionName: 'Demo Session',
        sessionPath: '/Sessions/Demo Session.ptx',
        sampleRate: 48000,
        bitDepth: 24,
      },
      tracks: [
        {
          id: 'track-1',
          name: 'Lead Vox',
          type: 'audio',
          color: '#ff4a90e2',
          is_soloed: true,
          is_muted: false,
        },
      ],
      error: '',
    },
  })
  const markup = renderToStaticMarkup(
    React.createElement(pageModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /Demo Session/)
  assert.match(markup, /\/Sessions\/Demo Session\.ptx/)
  assert.doesNotMatch(markup, /Sample rate/)
  assert.doesNotMatch(markup, /Bit depth/)
})

test('step 1 track list uses Status header and resolves camelCase mute\/solo flags', async () => {
  const pageModule = await loadPageModuleWithStateOverrides({
    2: {
      loading: false,
      connected: true,
      session: {
        sessionName: 'Demo Session',
        sessionPath: '/Sessions/Demo Session.ptx',
      },
      tracks: [
        {
          id: 'track-1',
          name: 'Lead Vox',
          type: 'audio',
          color: '#ff4a90e2',
          isSoloed: true,
          isMuted: false,
        },
      ],
      error: '',
    },
  })
  const markup = renderToStaticMarkup(
    React.createElement(pageModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, />Status<\/th>/)
  assert.doesNotMatch(markup, />M\/S<\/th>/)
  assert.match(markup, /ew-track-status-toggle is-soloed/)
})

test('step 2 markup keeps the legacy snapshot details action instead of inline rename controls', async () => {
  const pageModule = await loadPageModuleWithStateOverrides({
    1: 2,
    4: [createSampleSnapshot()],
  })
  const markup = renderToStaticMarkup(
    React.createElement(pageModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /Create Snapshot/)
  assert.match(markup, /Details/)
  assert.doesNotMatch(markup, /Rename/)
  assert.match(markup, /ew-step-shell ew-step-shell--snapshots/)
  assert.match(markup, /ew-block-card ew-block-card--snapshots/)
  assert.match(markup, /ew-table-wrap ew-table-wrap--snapshots/)
  assert.match(markup, /class="ew-table"/)
  assert.match(markup, />Snapshot<\/th>/)
  assert.match(markup, />Track state<\/th>/)
  assert.match(markup, />Actions<\/th>/)
})

test('step 3 markup keeps the legacy export controls and renders a real template textbox with app-styled wildcard select', async () => {
  const idleModule = await loadPageModuleWithStateOverrides({
    1: 3,
    2: {
      loading: false,
      connected: true,
      session: {
        sessionName: 'Demo Session',
        sessionPath: '/Sessions/Demo Session.ptx',
        sampleRate: 48000,
        bitDepth: 24,
      },
      tracks: [],
      error: '',
    },
    4: [createSampleSnapshot()],
    5: ['snapshot-1'],
    10: {
      file_format: 'wav',
      mix_sources: [
        { name: 'Ref Print', type: 'physicalOut' },
        { name: 'LV SC (Mono)', type: 'physicalOut' },
      ],
      online_export: false,
      file_name_template: '{session}_{snapshot}{source_suffix}',
      output_path: '/Exports',
    },
    11: [
      {
        id: 'preset-1',
        name: 'TV Mix',
        file_format: 'wav',
        mix_source_name: 'Ref Print',
        mix_source_type: 'PhysicalOut',
      },
    ],
    32: {
      physicalOut: [
        'Music (Stereo)',
        'All BV (Stereo)',
        'All BV.L (Mono)',
        'All BV.R (Mono)',
        'LV SC (Mono)',
      ],
      bus: [],
      output: [],
      renderer: [],
    },
  })
  const idleMarkup = renderToStaticMarkup(
    React.createElement(idleModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(idleMarkup, /Select snapshots to export/)
  assert.match(idleMarkup, /File Format/)
  assert.match(idleMarkup, /Mix Source/)
  assert.match(idleMarkup, /Ref Print/)
  assert.match(idleMarkup, /LV SC \(Mono\)/)
  assert.match(idleMarkup, /ew-mix-source-stack/)
  assert.match(idleMarkup, /ew-mix-source-row/)
  assert.doesNotMatch(idleMarkup, /Output Mix Source Name/)
  assert.doesNotMatch(idleMarkup, /Output Mix Source Type/)
  assert.match(idleMarkup, /All BV \(Stereo\)/)
  assert.match(idleMarkup, /LV SC \(Mono\)/)
  assert.doesNotMatch(idleMarkup, /\\u00A0\\u00A0\\u00A0/)
  assert.doesNotMatch(idleMarkup, /Mix Source Type/)
  assert.match(idleMarkup, /File Name Template/)
  assert.match(idleMarkup, /ew-template-builder/)
  assert.match(idleMarkup, /ew-template-input-shell/)
  assert.match(idleMarkup, /ew-template-preview/)
  assert.match(idleMarkup, /class="ew-input ew-template-input"/)
  assert.match(idleMarkup, /placeholder="\{session\}_\{snapshot\}\{source_suffix\}"/)
  assert.match(idleMarkup, /value="\{session\}_\{snapshot\}\{source_suffix\}"/)
  assert.match(idleMarkup, /文件名预览/)
  assert.doesNotMatch(idleMarkup, /File Name Preview/)
  assert.match(idleMarkup, /ew-template-runtime-preview/)
  assert.match(idleMarkup, /ew-template-runtime-preview__item/)
  assert.match(idleMarkup, /Demo Session_Verse Lead_Ref Print\.wav/)
  assert.doesNotMatch(idleMarkup, /Demo Session_Verse Lead_LV SC Mono\.wav/)
  assert.doesNotMatch(idleMarkup, /ew-template-runtime-preview__list/)
  assert.match(idleMarkup, /ew-template-pill ew-template-pill--token/)
  assert.match(idleMarkup, /data-template-value="\{session\}"/)
  assert.match(idleMarkup, /data-template-value="\{snapshot\}"/)
  assert.match(idleMarkup, /data-template-value="\{source_suffix\}"/)
  assert.match(idleMarkup, /class="ui-select ew-field-control ew-template-token-select"/)
  assert.match(idleMarkup, /Sample Rate/)
  assert.match(idleMarkup, /Bit Depth/)
  assert.match(idleMarkup, /Snapshot Count/)
  assert.match(idleMarkup, /Source Count/)
  assert.match(idleMarkup, /Source Type/)
  assert.match(idleMarkup, /File Format Token/)
  assert.match(idleMarkup, /Session Tokens/)
  assert.match(idleMarkup, /Snapshot Tokens/)
  assert.match(idleMarkup, /Source Tokens/)
  assert.match(idleMarkup, /Export Tokens/)
  assert.doesNotMatch(idleMarkup, /Add Text/)
  assert.doesNotMatch(idleMarkup, /Type separators or custom text/)
  assert.doesNotMatch(idleMarkup, /Add text or tokens to build the export file name\./)
  assert.doesNotMatch(idleMarkup, /ew-template-token-bank/)
  assert.match(idleMarkup, /Insert Wildcard/)
  assert.match(idleMarkup, /ew-template-token-select[\s\S]*ew-template-input-shell/)
  assert.match(idleMarkup, /Select a wildcard/)
  assert.match(idleMarkup, /{session}/)
  assert.match(idleMarkup, /{snapshot}/)
  assert.match(idleMarkup, /{source}/)
  assert.match(idleMarkup, /{sample_rate}/)
  assert.match(idleMarkup, /{bit_depth}/)
  assert.match(idleMarkup, /{snapshot_count}/)
  assert.match(idleMarkup, /{source_count}/)
  assert.match(idleMarkup, /{source_type}/)
  assert.match(idleMarkup, /{file_format}/)
  assert.match(idleMarkup, /{date}/)
  assert.match(idleMarkup, /{time}/)
  assert.match(idleMarkup, /{datetime}/)
  assert.match(idleMarkup, /{year}/)
  assert.match(idleMarkup, /{month}/)
  assert.match(idleMarkup, /{day}/)
  assert.doesNotMatch(idleMarkup, /contenteditable="true"/)
  assert.doesNotMatch(idleMarkup, /ew-template-editor/)
  assert.doesNotMatch(idleMarkup, /Supported tokens:/)
  assert.match(idleMarkup, /Output Path/)
  assert.match(idleMarkup, /Online Export/)
  assert.doesNotMatch(idleMarkup, /Export Presets/)
  assert.doesNotMatch(idleMarkup, /Save Export Preset/)
  assert.doesNotMatch(idleMarkup, /Import Export Presets/)
  assert.doesNotMatch(idleMarkup, /Use the legacy export controls, preset workflow, and execution feedback inside the current plugin shell\./)
  assert.doesNotMatch(idleMarkup, /Keep the legacy export naming controls, grouped like the import workflow forms\./)
  assert.doesNotMatch(idleMarkup, /Choose the folder that should receive rendered files\./)
  assert.doesNotMatch(idleMarkup, /Keep the existing export-mode toggle without changing runtime behavior\./)
  assert.doesNotMatch(idleMarkup, /Bounce mode/)
  assert.doesNotMatch(idleMarkup, /Output folder/)
  assert.match(idleMarkup, /ew-step-shell ew-step-shell--export/)
  assert.match(idleMarkup, /ew-export-layout/)
  assert.match(idleMarkup, /ew-export-main/)
  assert.match(idleMarkup, /ew-export-side/)
  assert.match(idleMarkup, /ew-block-card ew-block-card--settings/)
  assert.match(idleMarkup, /ew-block-card ew-block-card--selection/)
  assert.doesNotMatch(idleMarkup, /ew-block-card ew-block-card--result/)
  assert.doesNotMatch(idleMarkup, /Mobile progress QR/)
  assert.match(idleMarkup, /ew-table-wrap ew-table-wrap--selection/)
  assert.match(idleMarkup, /class="ew-table"/)
  assert.doesNotMatch(idleMarkup, />Selection<\/th>/)
  assert.match(idleMarkup, /ew-selection-check/)
  assert.match(idleMarkup, />Start Export</)
  assert.doesNotMatch(idleMarkup, /snapshot-1/)
  assert.match(idleMarkup, /ui-select/)
  assert.doesNotMatch(idleMarkup, /<select class="ew-select"/)
})

test('export page source keeps shared WorkflowSelect for source controls and wildcard insertion, and uses a real template textbox', async () => {
  const source = await readFile('plugins/official/export-workflow/dist/ExportWorkflowPage.mjs', 'utf8')

  assert.match(source, /WorkflowSelect/)
  assert.match(source, /file_name_template/)
  assert.match(source, /renderExportFileNameTemplate/)
  assert.match(source, /ew-template-builder/)
  assert.match(source, /ew-template-input-shell/)
  assert.match(source, /ew-template-preview/)
  assert.match(source, /ew-template-runtime-preview/)
  assert.match(source, /page\.label\.fileNamePreview/)
  assert.match(source, /ew-template-token-select[\s\S]*ew-template-input-shell|ew-template-input-shell[\s\S]*ew-template-runtime-preview/)
  assert.doesNotMatch(source, /ew-template-runtime-preview__list/)
  assert.match(source, /className:\s*'ew-input ew-template-input'/)
  assert.match(source, /className:\s*'ew-template-token-select'/)
  assert.match(source, /h\(WorkflowSelect,\s*\{/)
  assert.match(source, /buildFileNameTemplateTokenOptions/)
  assert.match(source, /options:\s*fileNameTemplateTokenOptions/)
  assert.match(source, /selectionStart/)
  assert.match(source, /setSelectionRange/)
  assert.match(source, /page\.tokenGroup\.date/)
  assert.match(source, /page\.token\.dateTime/)
  assert.doesNotMatch(source, /contentEditable:\s*true/)
  assert.doesNotMatch(source, /file_prefix/)
})

test('step 3 wildcard dropdown inserts the selected token at the current textbox caret', async () => {
  const { pageModule, stateUpdates, restore } = await loadPageModuleWithHookHarness({
    1: 3,
    4: [createSampleSnapshot()],
    5: ['snapshot-1'],
    10: {
      file_format: 'wav',
      mix_sources: [{ name: 'Ref Print', type: 'physicalOut' }],
      online_export: false,
      file_name_template: '{session}_mix',
      output_path: '/Exports',
    },
    32: {
      physicalOut: ['Ref Print'],
      bus: [],
      output: [],
      renderer: [],
    },
  })

  try {
    const tree = pageModule.ExportWorkflowPage({
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    })

    const templateInput = findElement(
      tree,
      (node) => node.type === 'input' && String(node.props?.className ?? '').includes('ew-template-input'),
    )
    const tokenSelect = findElement(
      tree,
      (node) => typeof node.type === 'function' && String(node.props?.className ?? '').includes('ew-template-token-select'),
    )

    assert.ok(templateInput, 'expected real template textbox')
    assert.ok(tokenSelect, 'expected categorized token select')
    templateInput.props.onSelect({
      currentTarget: {
        selectionStart: '{session}_'.length,
        selectionEnd: '{session}_'.length,
      },
    })
    tokenSelect.props.onChange({ target: { value: '{file_format}' } })

    const settingsUpdate = stateUpdates.find((update) => update.index === 10)
    assert.ok(settingsUpdate, 'expected token dropdown change to update export settings state')
    assert.equal(typeof settingsUpdate.value, 'function')

    const nextSettings = settingsUpdate.value({
      file_format: 'wav',
      mix_sources: [{ name: 'Ref Print', type: 'physicalOut' }],
      online_export: false,
      file_name_template: '{session}_mix',
      output_path: '/Exports',
    })

    assert.equal(nextSettings.file_name_template, '{session}_{file_format}mix')
  } finally {
    restore()
  }
})

test('step 3 template textbox commits typed text through change events', async () => {
  const { pageModule, stateUpdates, restore } = await loadPageModuleWithHookHarness({
    1: 3,
    4: [createSampleSnapshot()],
    5: ['snapshot-1'],
    10: {
      file_format: 'wav',
      mix_sources: [{ name: 'Ref Print', type: 'physicalOut' }],
      online_export: false,
      file_name_template: '{session}',
      output_path: '/Exports',
    },
    32: {
      physicalOut: ['Ref Print'],
      bus: [],
      output: [],
      renderer: [],
    },
  })

  try {
    const tree = pageModule.ExportWorkflowPage({
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    })

    const templateInput = findElement(
      tree,
      (node) => node.type === 'input' && String(node.props?.className ?? '').includes('ew-template-input'),
    )

    assert.ok(templateInput, 'expected real template textbox')
    templateInput.props.onChange({ target: { value: '{session}_v2' } })

    const settingsUpdate = stateUpdates.find((update) => update.index === 10)
    assert.ok(settingsUpdate, 'expected textbox change to update export settings state')
    assert.equal(typeof settingsUpdate.value, 'function')

    const nextSettings = settingsUpdate.value({
      file_format: 'wav',
      mix_sources: [{ name: 'Ref Print', type: 'physicalOut' }],
      online_export: false,
      file_name_template: '{session}',
      output_path: '/Exports',
    })

    assert.equal(nextSettings.file_name_template, '{session}_v2')
  } finally {
    restore()
  }
})

test('step 3 template textbox tracks caret updates from click and selection events', async () => {
  const { pageModule, stateUpdates, restore } = await loadPageModuleWithHookHarness({
    1: 3,
    4: [createSampleSnapshot()],
    5: ['snapshot-1'],
    10: {
      file_format: 'wav',
      mix_sources: [{ name: 'Ref Print', type: 'physicalOut' }],
      online_export: false,
      file_name_template: 'mix_{snapshot}',
      output_path: '/Exports',
    },
    32: {
      physicalOut: ['Ref Print'],
      bus: [],
      output: [],
      renderer: [],
    },
  })

  try {
    const tree = pageModule.ExportWorkflowPage({
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    })

    const templateInput = findElement(
      tree,
      (node) => node.type === 'input' && String(node.props?.className ?? '').includes('ew-template-input'),
    )
    const tokenSelect = findElement(
      tree,
      (node) => typeof node.type === 'function' && String(node.props?.className ?? '').includes('ew-template-token-select'),
    )

    assert.ok(templateInput, 'expected real template textbox')
    assert.ok(tokenSelect, 'expected wildcard select')

    templateInput.props.onClick({
      currentTarget: {
        selectionStart: 3,
        selectionEnd: 3,
      },
    })
    templateInput.props.onSelect({
      currentTarget: {
        selectionStart: 3,
        selectionEnd: 3,
      },
    })
    tokenSelect.props.onChange({ target: { value: '{date}' } })

    const settingsUpdate = stateUpdates.find((update) => update.index === 10)
    assert.ok(settingsUpdate, 'expected caret-based insert to update export settings state')
    assert.equal(typeof settingsUpdate.value, 'function')

    const nextSettings = settingsUpdate.value({
      file_format: 'wav',
      mix_sources: [{ name: 'Ref Print', type: 'physicalOut' }],
      online_export: false,
      file_name_template: 'mix_{snapshot}',
      output_path: '/Exports',
    })

    assert.equal(nextSettings.file_name_template, 'mix{date}_{snapshot}')
  } finally {
    restore()
  }
})

test('step 3 browse action uses host folder picking to update the output path', async () => {
  const { pageModule, stateUpdates, restore } = await loadPageModuleWithHookHarness({
    1: 3,
    4: [createSampleSnapshot()],
    5: ['snapshot-1'],
    10: {
      file_format: 'wav',
      mix_sources: [{ name: 'Ref Print', type: 'physicalOut' }],
      online_export: false,
      file_name_template: '{session}_{snapshot}{source_suffix}',
      output_path: '',
    },
    32: {
      physicalOut: ['Ref Print'],
      bus: [],
      output: [],
      renderer: [],
    },
  })
  const pickFolderCalls = []

  try {
    const tree = pageModule.ExportWorkflowPage({
      context: createPluginContext(),
      host: {
        pickFolder: async () => {
          pickFolderCalls.push('called')
          return {
            canceled: false,
            paths: ['/Chosen/Exports'],
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

    assert.ok(browseButton, 'expected export settings to render a Browse action')
    await browseButton.props.onClick()
    assert.equal(pickFolderCalls.length, 1)

    const settingsUpdate = stateUpdates.find((update) => update.index === 10)
    assert.ok(settingsUpdate, 'expected output path browse action to update export settings state')
    assert.equal(typeof settingsUpdate.value, 'function')

    const nextSettings = settingsUpdate.value({
      file_format: 'wav',
      mix_sources: [{ name: 'Ref Print', type: 'physicalOut' }],
      online_export: false,
      file_name_template: '{session}_{snapshot}{source_suffix}',
      output_path: '',
    })

    assert.equal(nextSettings.output_path, '/Chosen/Exports')
  } finally {
    restore()
  }
})

test('step 3 progress panel stays backend-driven and omits mobile-progress runtime ui', async () => {
  const runningModule = await loadPageModuleWithStateOverrides({
    1: 3,
    4: [createSampleSnapshot()],
    5: ['snapshot-1'],
    6: {
      defaultSnapshotSelection: 'all',
    },
    10: {
      file_format: 'wav',
      mix_sources: [{ name: 'Ref Print (Stereo)', type: 'physicalOut' }],
      online_export: false,
      file_name_template: '{session}_{snapshot}{source_suffix}',
      output_path: '/Exports',
    },
    14: createRunningJobView(),
    15: 'job-1',
    32: {
      physicalOut: ['Ref Print (Stereo)'],
      bus: [],
      output: [],
      renderer: [],
    },
  })
  const markup = renderToStaticMarkup(
    React.createElement(runningModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.doesNotMatch(markup, /Mobile progress QR/)
  assert.doesNotMatch(markup, /ew-mobile-progress-/)
  assert.match(markup, /ew-progress-panel/)
  assert.match(markup, /ew-progress-breakdown/)
  assert.match(markup, /ew-progress-current-file/)
  assert.match(markup, /ew-progress-overall/)
  assert.match(markup, /ew-progress-shell ew-progress-shell--file/)
  assert.match(markup, /ew-progress-shell ew-progress-shell--overall/)
  assert.match(markup, /Ref Print \(Stereo\)/)
})

test('step 3 keeps export result visible after completion instead of jumping back to export settings', async () => {
  const completedModule = await loadPageModuleWithStateOverrides({
    1: 3,
    4: [createSampleSnapshot()],
    5: ['snapshot-1'],
    10: {
      file_format: 'wav',
      mix_sources: [{ name: 'Ref Print (Stereo)', type: 'physicalOut' }],
      online_export: false,
      file_name_template: '{session}_{snapshot}{source_suffix}',
      output_path: '/Exports',
    },
    14: createRunningJobView({
      state: 'succeeded',
      terminalStatus: 'completed',
      progressPercent: 100,
      message: 'Export complete',
      exportedCount: 1,
      exportedFiles: ['/Exports/Verse Lead.wav'],
      success: true,
      isTerminal: true,
    }),
    15: 'job-1',
    32: {
      physicalOut: ['Ref Print (Stereo)'],
      bus: [],
      output: [],
      renderer: [],
    },
  })
  const markup = renderToStaticMarkup(
    React.createElement(completedModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /Export complete/)
  assert.match(markup, /Export Completed!/)
  assert.match(markup, /Continue Export/)
  assert.doesNotMatch(markup, /Open Folder/)
  assert.match(markup, /ew-progress-panel/)
  assert.doesNotMatch(markup, /Select snapshots to export/)
})

test('snapshot detail modal renders redesigned modal sections in the live page markup', async () => {
  const snapshot = createSampleSnapshot({
    trackStates: [
      {
        trackId: 'track-1',
        trackName: 'Lead Vox',
        is_soloed: true,
        is_muted: false,
        type: 'audio',
        color: '#ff4a90e2',
      },
      {
        trackId: 'track-2',
        trackName: 'FX Stem',
        is_soloed: false,
        is_muted: true,
        type: 'aux',
        color: '#ff33cc77',
      },
    ],
  })
  const pageModule = await loadPageModuleWithStateOverrides({
    1: 2,
    4: [snapshot],
    19: snapshot.id,
    20: true,
    21: snapshot.name,
    22: snapshot.trackStates,
  })
  const markup = renderToStaticMarkup(
    React.createElement(pageModule.ExportWorkflowPage, {
      context: createPluginContext(),
      params: {},
      searchParams: new URLSearchParams(),
    }),
  )

  assert.match(markup, /ew-modal-surface ew-modal-sheet is-wide/)
  assert.match(markup, /ew-modal-header-actions/)
  assert.match(markup, /ew-modal-body ew-modal-body--detail ew-modal-stack/)
  assert.match(markup, /ew-detail-stats ew-modal-section ew-modal-section--detail-stats/)
  assert.match(markup, /ew-stats-inline/)
  assert.match(markup, /ew-stats-inline__item/)
  assert.match(markup, /ew-detail-table-shell ew-modal-section ew-modal-section--detail-table/)
  assert.match(markup, /ew-table-wrap ew-table-wrap--detail/)
  assert.match(markup, /class="ew-detail-table ew-table"/)
  assert.match(markup, /Snapshot Track Information/)
  assert.match(markup, /Edit Name/)
  assert.doesNotMatch(markup, /ew-detail-title/)
  assert.doesNotMatch(markup, /ew-modal-section--detail-name/)
  assert.doesNotMatch(markup, /Snapshot ID:/)
  assert.doesNotMatch(markup, /track-1/)
  assert.doesNotMatch(markup, /track-2/)
  assert.match(markup, />Track Info<\/th>/)
  assert.doesNotMatch(markup, />Track<\/th>/)
  assert.match(markup, />Status<\/th>/)
})

test('page source removes preset workflow affordances from the export page', async () => {
  const pageSource = await readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8')

  assert.doesNotMatch(pageSource, /Export Presets/)
  assert.doesNotMatch(pageSource, /Save Export Preset/)
  assert.doesNotMatch(pageSource, /Import Export Presets/)
  assert.doesNotMatch(pageSource, /Preset Name/)
})

test('export page source preserves current export workflow labels and modal surfaces', async () => {
  const source = await readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8')

  assert.match(source, /page\.card\.selectSnapshots/)
  assert.match(source, /page\.label\.fileFormat/)
  assert.match(source, /page\.label\.mixSource/)
  assert.match(source, /MIX_SOURCE_GROUP_ORDER/)
  assert.match(source, /page\.option\.mixSourceGroup\.\$\{group\}/)
  assert.match(source, /group:\s*groupLabel/)
  assert.doesNotMatch(source, /\\u00A0\\u00A0\\u00A0/)
  assert.doesNotMatch(source, /page\.label\.mixSourceGroup/)
  assert.match(source, /page\.label\.fileNameTemplate/)
  assert.match(source, /page\.label\.outputPath/)
  assert.match(source, /host\.pickFolder\(\)/)
  assert.match(source, /page\.button\.browse/)
  assert.match(source, /page\.label\.onlineExport/)
  assert.match(source, /page\.button\.startExport/)
  assert.match(source, /page\.button\.stopExport/)
  assert.match(source, /page\.button\.details/)
  assert.match(source, /failedSnapshotDetails/)
  assert.match(source, /page\.label\.status/)
  assert.match(source, /ew-table-wrap ew-table-wrap--snapshots/)
  assert.match(source, /ew-table-wrap ew-table-wrap--selection/)
  assert.match(source, /className:\s*'ew-export-layout'/)
  assert.match(source, /className:\s*'ew-export-main'/)
  assert.match(source, /className:\s*'ew-export-side'/)
  assert.match(source, /align:\s*'space-between'/)
  assert.match(source, /className:\s*'ew-action-bar'/)
  assert.match(source, /className:\s*'ew-action-slot'/)
})

test('export page source uses real track-type icon components instead of placeholder glyph characters', async () => {
  const source = await readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8')

  assert.match(source, /function AudioTrackIcon\(/)
  assert.match(source, /function MidiTrackIcon\(/)
  assert.match(source, /function AuxTrackIcon\(/)
  assert.match(source, /function MasterTrackIcon\(/)
  assert.match(source, /function InstrumentTrackIcon\(/)
  assert.doesNotMatch(source, /from ['"]@mui\/icons-material\//)
  assert.doesNotMatch(source, /const glyphByType = \{/)
})

test('export page source removes simplified replacements that diverge from old UI flow', async () => {
  const source = await readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /'Rename'/)
  assert.doesNotMatch(source, /'Cancel export'/)
  assert.doesNotMatch(source, /'Apply preset'/)
  assert.doesNotMatch(source, /'Save preset'/)
})

test('snapshot step source does not render the file storage callout copy', async () => {
  const source = await readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8')

  assert.doesNotMatch(source, /File Storage/)
  assert.doesNotMatch(source, /resolve the snapshot file path/)
})

test('export page source keeps the live track list in sync while the session step is open', async () => {
  const source = await readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8')

  assert.match(source, /TRACK_LIST_SYNC_MS/)
  assert.match(source, /loadWorkflowState\(\{ tracksOnly: true \}\)/)
  assert.match(source, /currentStep !== 1/)
})

test('export page source loads plugin-local settings and applies the default snapshot selection policy', async () => {
  const source = await readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8')

  assert.match(source, /loadExportWorkflowSettings\(context\.storage\)/)
  assert.match(source, /defaultSnapshotSelection/)
  assert.match(source, /currentFileProgressPercent/)
  assert.match(source, /overallProgressPercent/)
  assert.match(source, /currentMixSourceName/)
  assert.doesNotMatch(source, /context\.runtime/)
  assert.doesNotMatch(source, /mobileProgress/)
  assert.doesNotMatch(source, /openFolder/)
  assert.doesNotMatch(source, /openPath/)
})

test('export page source resets active export state immediately after cancel', async () => {
  const source = await readFile(new URL('../dist/ExportWorkflowPage.mjs', import.meta.url), 'utf8')

  assert.match(source, /const resetActiveExportState = useCallback\(/)
  assert.match(source, /await context\.presto\.jobs\.cancel\(runningJobId\)/)
  assert.match(source, /resetActiveExportState\(\)/)
  assert.doesNotMatch(source, /await context\.presto\.jobs\.cancel\(runningJobId\)[\s\S]*void pollJob\(runningJobId\)/)
})

test('export css keeps import-style shell classes for cards, sections, and modals', async () => {
  const cssSource = await readFile(new URL('../dist/export-workflow.css', import.meta.url), 'utf8')

  assert.match(cssSource, /\.ew-step-shell\s*\{/)
  assert.match(cssSource, /\.ew-block-card/)
  assert.match(cssSource, /\.ew-section-panel/)
  assert.match(cssSource, /\.ew-modal-sheet/)
  assert.match(cssSource, /\.ew-modal-section/)
  assert.match(cssSource, /\.ew-settings-grid/)
  assert.match(cssSource, /\.ew-stepper-row/)
  assert.match(cssSource, /\.ew-step\s*\{/)
  assert.match(cssSource, /\.ew-table-wrap/)
  assert.match(cssSource, /\.ew-table/)
  assert.match(cssSource, /\.ew-stats-inline__item/)
  assert.match(cssSource, /\.ew-modal-header-actions/)
  assert.match(cssSource, /\.ew-modal-body--detail/)
  assert.match(cssSource, /\.ew-export-layout\s*\{/)
  assert.match(cssSource, /\.ew-export-main,\s*[\s\S]*\.ew-export-side\s*\{/)
  assert.match(cssSource, /\.ew-shell\s*\{[\s\S]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/)
  assert.match(cssSource, /\.ew-action-slot\s*\{/)
  assert.match(cssSource, /\.ew-row\.is-selected\s*\{[\s\S]*background:/)
  assert.doesNotMatch(cssSource, /Import-style redesign overrides/)
  assert.doesNotMatch(cssSource, /\.ew-overlay-panel/)
  assert.doesNotMatch(cssSource, /\.ew-storage-callout/)
  assert.doesNotMatch(cssSource, /\.ew-preset-launch-row/)
})

test('export css keeps the filename template control styled as a real textbox', async () => {
  const cssSource = await readFile(new URL('../dist/export-workflow.css', import.meta.url), 'utf8')

  assert.match(cssSource, /\.ew-template-builder\s*\{/)
  assert.match(cssSource, /\.ew-template-input-shell\s*\{/)
  assert.match(cssSource, /\.ew-template-preview\s*\{/)
  assert.match(cssSource, /\.ew-template-runtime-preview\s*\{/)
  assert.match(cssSource, /\.ew-template-runtime-preview__item\s*\{/)
  assert.match(cssSource, /\.ew-template-input-shell:focus-within\s+\.ew-template-input::selection\s*\{/)
  assert.match(cssSource, /background:\s*color-mix\(in srgb,\s*var\(--ew-color-primary\)/)
  assert.doesNotMatch(cssSource, /text-transform:\s*uppercase;/)
  assert.doesNotMatch(cssSource, /\.ew-template-runtime-preview__list\s*\{/)
  assert.match(cssSource, /\.ew-template-input\s*\{/)
  assert.match(cssSource, /\.ew-template-token-select\s+\.ew-select,/)
  assert.match(cssSource, /\.ew-template-pill\s*\{/)
  assert.doesNotMatch(cssSource, /\.ew-template-editor\s*\{/)
})

test('export css keeps the plugin stepper horizontal on narrow widths and truncates tables instead of enabling horizontal scroll', async () => {
  const cssSource = await readFile(new URL('../dist/export-workflow.css', import.meta.url), 'utf8')

  assert.doesNotMatch(cssSource, /@media \(max-width: 800px\)\s*\{[\s\S]*\.ew-stepper-row\s*\{[\s\S]*grid-template-columns:\s*1fr/)
  assert.match(cssSource, /@media \(max-width: 800px\)\s*\{[\s\S]*\.ew-stepper-label\s*\{[\s\S]*display:\s*none;/)
  assert.doesNotMatch(cssSource, /\.ew-table\s*\{[\s\S]*min-width:\s*680px;/)
  assert.match(cssSource, /\.ew-table-wrap\s*\{[\s\S]*overflow-x:\s*hidden;/)
  assert.match(cssSource, /\.ew-main\s*\{[\s\S]*scrollbar-gutter:\s*stable;/)
})
