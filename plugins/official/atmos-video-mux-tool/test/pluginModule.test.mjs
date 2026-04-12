import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

let pluginModulePromise = null

function createSharedUiMock() {
  return {
    WorkflowFrame({ title, subtitle, steps = [], currentStep = 1, children, footer, className }) {
      return React.createElement(
        'section',
        { className: ['presto-workflow-frame', className].filter(Boolean).join(' ') },
        React.createElement(
          'header',
          { className: 'presto-workflow-frame__header' },
          React.createElement(
            'div',
            { className: 'presto-page-header' },
            React.createElement('h1', null, title),
            subtitle ? React.createElement('p', null, subtitle) : null,
          ),
        ),
        React.createElement(
          'div',
          { className: 'presto-workflow-stepper presto-workflow-frame__steps' },
          steps.map((step, index) =>
            React.createElement(
              'div',
              {
                key: step.id ?? index,
                className: [
                  'presto-workflow-stepper__item',
                  index + 1 === currentStep ? 'presto-workflow-stepper__item--active' : null,
                  index + 1 < currentStep ? 'presto-workflow-stepper__item--complete' : null,
                ]
                  .filter(Boolean)
                  .join(' '),
              },
              React.createElement('span', { className: 'presto-workflow-stepper__index' }, String(index + 1)),
              React.createElement(
                'span',
                { className: 'presto-workflow-stepper__label' },
                typeof step === 'object' && step !== null && 'label' in step ? step.label : step,
              ),
            ),
          ),
        ),
        React.createElement('div', { className: 'presto-workflow-frame__body' }, children),
        footer ? React.createElement('footer', { className: 'presto-workflow-frame__footer' }, footer) : null,
      )
    },
    Panel({ title, description, actions, children, className }) {
      return React.createElement(
        'section',
        { className: ['ui-panel', className].filter(Boolean).join(' ') },
        title || description || actions
          ? React.createElement(
              'header',
              { className: 'ui-panel__header' },
              React.createElement(
                'div',
                { className: 'ui-panel__header-main' },
                title ? React.createElement('h2', { className: 'ui-panel__title' }, title) : null,
                description ? React.createElement('p', { className: 'ui-panel__description' }, description) : null,
              ),
              actions ? React.createElement('div', { className: 'ui-panel__actions' }, actions) : null,
            )
          : null,
        React.createElement('div', { className: 'ui-panel__body' }, children),
      )
    },
    WorkflowActionBar({ children, className, align = 'end' }) {
      return React.createElement(
        'div',
        {
          className: ['presto-workflow-action-bar', className].filter(Boolean).join(' '),
        },
        React.createElement(
          'div',
          {
            className: [
              'presto-workflow-action-bar__inner',
              align === 'space-between' ? 'presto-workflow-action-bar__inner--space-between' : null,
              align === 'start' ? 'presto-workflow-action-bar__inner--start' : null,
            ]
              .filter(Boolean)
              .join(' '),
          },
          children,
        ),
      )
    },
    Button({ children, className, ...props }) {
      return React.createElement(
        'button',
        {
          ...props,
          type: props.type ?? 'button',
          className: ['ui-button', className].filter(Boolean).join(' '),
        },
        children,
      )
    },
    Input({ label, hint, error, className, ...props }) {
      return React.createElement(
        'label',
        { className: ['ui-input', className].filter(Boolean).join(' ') },
        label ? React.createElement('span', null, label) : null,
        React.createElement('input', props),
        error ? React.createElement('span', null, error) : hint ? React.createElement('span', null, hint) : null,
      )
    },
    Badge({ children, className }) {
      return React.createElement('span', { className: ['ui-badge', className].filter(Boolean).join(' ') }, children)
    },
    StatChip({ label, value, className }) {
      return React.createElement(
        'div',
        { className: ['ui-stat-chip', className].filter(Boolean).join(' ') },
        React.createElement('span', null, label),
        React.createElement('strong', null, String(value)),
      )
    },
  }
}

function createHostMock(overrides = {}) {
  return {
    dialog: {
      openFile: async () => ({ canceled: true, paths: [] }),
      openDirectory: async () => ({ canceled: true, paths: [] }),
      ...(overrides.dialog ?? {}),
    },
    fs: {
      readdir: async () => [],
      ...(overrides.fs ?? {}),
    },
    shell: {
      openPath: async () => 'ok',
      ...(overrides.shell ?? {}),
    },
    runTool: async () => ({
      jobId: 'job-tool-run',
      job: {
        jobId: 'job-tool-run',
        capability: 'tool.run',
        state: 'succeeded',
        progress: { current: 1, total: 1, percent: 100 },
        result: {
          summary: 'Atmos video mux completed.',
          result: {
            outputPath: '/tmp/out/Atmos_Output_20260412_220000.mp4',
          },
        },
      },
    }),
    ...overrides,
  }
}

async function loadPageModuleWithHookHarness(overrides = {}) {
  const previousWindow = globalThis.window
  const originals = {
    useState: React.useState,
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
    const pageUrl = new URL('../dist/AtmosVideoMuxToolPage.mjs', import.meta.url)
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
    entryUrl.searchParams.set('scenario', Math.random().toString(36).slice(2))

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

test('atmos video mux tool manifest stays aligned between file and entry export', async () => {
  const pluginModule = await loadPluginModule()
  const raw = await readFile(new URL('../manifest.json', import.meta.url), 'utf8')
  const fileManifest = JSON.parse(raw)

  assert.equal(fileManifest.pluginId, pluginModule.manifest.pluginId)
  assert.equal(fileManifest.entry, pluginModule.manifest.entry)
  assert.equal(fileManifest.styleEntry, pluginModule.manifest.styleEntry)
  assert.equal(fileManifest.extensionType, 'tool')
  assert.deepEqual(fileManifest.supportedDaws, [])
  assert.deepEqual(fileManifest.pages, pluginModule.manifest.pages)
  assert.deepEqual(fileManifest.tools, pluginModule.manifest.tools)
  assert.deepEqual(fileManifest.toolRuntimePermissions, pluginModule.manifest.toolRuntimePermissions)
  assert.deepEqual(fileManifest.bundledResources, pluginModule.manifest.bundledResources)
  assert.deepEqual(fileManifest.requiredCapabilities, [])
})

test('tool manifest declares the expected runtime permissions and bundled resources only', async () => {
  const pluginModule = await loadPluginModule()
  assert.equal(pluginModule.manifest.styleEntry, 'dist/atmos-video-mux-tool.css')
  assert.deepEqual(pluginModule.manifest.toolRuntimePermissions, [
    'dialog.openFile',
    'dialog.openDirectory',
    'fs.list',
    'shell.openPath',
    'process.execBundled',
  ])

  assert.deepEqual(
    pluginModule.manifest.bundledResources.map((resource) => resource.resourceId),
    ['atmos-video-mux-script', 'ffmpeg', 'ffprobe', 'mp4demuxer', 'mp4muxer'],
  )
  assert.equal(pluginModule.manifest.pages[0]?.mount, 'tools')
  assert.equal(pluginModule.manifest.tools[0]?.runnerExport, 'runAtmosVideoMuxTool')
})

test('runner executes bundled script resource with expected args', async () => {
  const pluginModule = await loadPluginModule()

  const calls = []
  const context = {
    process: {
      async execBundled(resourceId, args) {
        calls.push({ resourceId, args })
        return {
          ok: true,
          exitCode: 0,
          stdout: 'OUTPUT_PATH=/tmp/Atmos_Output_20260412_220000.mp4',
          stderr: '',
        }
      },
    },
  }

  const result = await pluginModule.runAtmosVideoMuxTool(context, {
    videoPath: '/tmp/video.mp4',
    atmosPath: '/tmp/atmos.mp4',
    outputDir: '/tmp/out',
    allowFpsConversion: true,
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.resourceId, 'atmos-video-mux-script')
  assert.deepEqual(calls[0]?.args, [
    '--video',
    '/tmp/video.mp4',
    '--atmos',
    '/tmp/atmos.mp4',
    '--output-dir',
    '/tmp/out',
    '--allow-fps-conversion',
  ])
  assert.equal(result.result.outputPath, '/tmp/Atmos_Output_20260412_220000.mp4')
  assert.match(result.summary, /Atmos video mux completed:/)
})

test('tool page renders the formal three-step workflow shell instead of the old staging page', async () => {
  const pluginModule = await loadPluginModule()
  const markup = renderToStaticMarkup(
    React.createElement(pluginModule.AtmosVideoMuxToolPage, {
      host: createHostMock(),
    }),
  )

  assert.match(markup, /Atmos Video Mux/)
  assert.match(markup, /Sources/)
  assert.match(markup, /Output/)
  assert.match(markup, /Review \/ Run/)
  assert.match(markup, /presto-workflow-frame/)
  assert.match(markup, /presto-workflow-stepper/)
  assert.match(markup, /ui-panel/)
  assert.match(markup, /presto-workflow-action-bar/)
  assert.match(markup, /Pick video MP4/)
  assert.match(markup, /Pick Atmos MP4/)
  assert.match(markup, /Run option/)
  assert.match(markup, /Next: Output/)
  assert.doesNotMatch(markup, /Host-side tool execution wiring is pending/)
  assert.doesNotMatch(markup, /Runner payload preview/)
})

test('tool page source routes runs through host.runTool and shared workflow ui helpers', async () => {
  const [pageSource, uiSource] = await Promise.all([
    readFile(new URL('../dist/AtmosVideoMuxToolPage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/ui.mjs', import.meta.url), 'utf8'),
  ])

  assert.match(pageSource, /host\.runTool/)
  assert.match(pageSource, /WorkflowFrame/)
  assert.match(pageSource, /\.\/ui\.mjs/)
  assert.doesNotMatch(pageSource, /layoutStyle/)
  assert.match(uiSource, /presto-workflow-action-bar/)
  assert.match(uiSource, /ui-panel/)
})

test('review step run action calls host.runTool with the normalized Atmos mux payload', async () => {
  const { pageModule, restore } = await loadPageModuleWithHookHarness({
    1: 3,
    2: '/tmp/source/video.mp4',
    3: '/tmp/source/atmos.mp4',
    4: '/tmp/out',
    5: true,
    6: null,
    7: '',
    8: false,
  })
  const calls = []
  const host = createHostMock({
    runTool: async (request) => {
      calls.push(request)
      return {
        jobId: 'job-atmos-run',
        job: {
          jobId: 'job-atmos-run',
          capability: 'tool.run',
          state: 'succeeded',
          progress: { current: 1, total: 1, percent: 100 },
          result: {
            summary: 'Atmos video mux completed.',
            result: {
              outputPath: '/tmp/out/Atmos_Output_20260412_220000.mp4',
            },
          },
        },
      }
    },
  })

  try {
    const tree = pageModule.AtmosVideoMuxToolPage({
      host,
    })
    const runButton = findElement(
      tree,
      (node) => typeof node.type === 'function' && getElementText(node.props?.children) === 'Run Atmos Mux',
    )

    assert.ok(runButton, 'expected review step to expose a Run Atmos Mux action')
    await runButton.props.onClick()
  } finally {
    restore()
  }

  assert.deepEqual(calls, [
    {
      toolId: 'atmos-video-mux',
      input: {
        videoPath: '/tmp/source/video.mp4',
        atmosPath: '/tmp/source/atmos.mp4',
        outputDir: '/tmp/out',
        allowFpsConversion: true,
        overwrite: true,
      },
    },
  ])
})
