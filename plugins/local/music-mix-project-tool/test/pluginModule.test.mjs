import test from 'node:test'
import assert from 'node:assert/strict'
import { access, mkdtemp, readFile, rm } from 'node:fs/promises'
import { execFile as execFileCallback } from 'node:child_process'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const execFile = promisify(execFileCallback)

let pluginModulePromise = null

function createSharedUiMock() {
  return {
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
    Input({ label, hint, className, ...props }) {
      return React.createElement(
        'label',
        { className: ['ui-input', className].filter(Boolean).join(' ') },
        label ? React.createElement('span', null, label) : null,
        React.createElement('input', props),
        hint ? React.createElement('span', null, hint) : null,
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
      openDirectory: async () => ({ canceled: true, paths: [] }),
      ...(overrides.dialog ?? {}),
    },
    fs: {
      exists: async () => false,
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
          summary: 'Music mix project created.',
          result: {
            createdRoot: '/tmp/mixes/260501_Blue Sky',
            createdDirectories: ['01_Received'],
            createdFiles: [],
          },
        },
      },
    }),
    ...overrides,
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

async function loadPageModuleWithHookHarness(overrides = {}) {
  const previousWindow = globalThis.window
  const originals = {
    useState: React.useState,
    useMemo: React.useMemo,
    useCallback: React.useCallback,
    useEffect: React.useEffect,
  }
  let stateCallIndex = 0

  React.useState = (initialValue) => {
    stateCallIndex += 1
    const resolvedInitialValue = typeof initialValue === 'function' ? initialValue() : initialValue
    const resolvedValue = Object.prototype.hasOwnProperty.call(overrides, stateCallIndex)
      ? overrides[stateCallIndex]
      : resolvedInitialValue
    return [resolvedValue, () => {}]
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
    const pageUrl = new URL('../dist/MusicMixProjectToolPage.mjs', import.meta.url)
    pageUrl.searchParams.set('test', String(Date.now()))
    pageUrl.searchParams.set('scenario', Math.random().toString(36).slice(2))
    const pageModule = await import(pageUrl.href)
    return { pageModule, restore }
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
    return node.map(getElementText).join('')
  }
  return getElementText(node.props?.children)
}

function findElement(node, predicate) {
  if (!node || typeof node !== 'object') {
    return null
  }
  if (predicate(node)) {
    return node
  }
  const children = node.props?.children
  if (Array.isArray(children)) {
    for (const child of children) {
      const found = findElement(child, predicate)
      if (found) {
        return found
      }
    }
    return null
  }
  return findElement(children, predicate)
}

test('music mix project tool manifest stays aligned between file and entry export', async () => {
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

test('tool manifest declares only the required permissions and bundled script resource', async () => {
  const pluginModule = await loadPluginModule()

  assert.equal(pluginModule.manifest.pluginId, 'loyan.music-mix-project-tool')
  assert.equal(pluginModule.manifest.pages[0]?.path, '/tools/music-mix-project-tool')
  assert.equal(pluginModule.manifest.pages[0]?.mount, 'tools')
  assert.equal(pluginModule.manifest.tools[0]?.runnerExport, 'runMusicMixProjectTool')
  assert.deepEqual(pluginModule.manifest.toolRuntimePermissions, [
    'dialog.openDirectory',
    'fs.read',
    'shell.openPath',
    'process.execBundled',
  ])
  assert.deepEqual(
    pluginModule.manifest.bundledResources.map((resource) => resource.resourceId),
    ['music-mix-project-script'],
  )
})

test('tool page renders required inputs, checkboxes, storage-backed copy, and preview', async () => {
  const { pageModule, restore } = await loadPageModuleWithHookHarness({
    1: '2026-05-01',
    2: 'Blue Sky',
    3: [
      { id: 'default-1', label: 'Received', selected: true },
      { id: 'default-2', label: 'DAW_Projects', selected: true },
      { id: 'default-3', label: 'Exports', selected: true },
      { id: 'default-4', label: 'Documents', selected: true },
      { id: 'default-5', label: 'Archive', selected: true },
    ],
    4: '',
    5: false,
    6: null,
  })

  try {
    const markup = renderToStaticMarkup(
      React.createElement(pageModule.MusicMixProjectToolPage, {
        context: {
          locale: { requested: 'en', resolved: 'en' },
        },
        host: createHostMock(),
      }),
    )

    assert.match(markup, /Date/)
    assert.match(markup, /type="date"/)
    assert.match(markup, /Song Name/)
    assert.match(markup, /Preview/)
    assert.match(markup, /Received/)
    assert.match(markup, /DAW_Projects/)
    assert.match(markup, /Exports/)
    assert.match(markup, /Documents/)
    assert.match(markup, /Archive/)
    assert.match(markup, /260501_Blue Sky/)
    assert.match(markup, /Choose destination when creating/)
    assert.match(markup, /Add Folder/)
    assert.match(markup, /Create Project/)
    assert.match(markup, /01/)
    assert.match(markup, /02/)
    assert.match(markup, /ui-panel/)
    assert.doesNotMatch(markup, /Project Setup/)
    assert.doesNotMatch(markup, /Base Root/)
    assert.doesNotMatch(markup, /Remembered as the default base root/)
    assert.doesNotMatch(markup, /Create one music mix project folder and choose the directories for this run\./)
    assert.doesNotMatch(markup, /Music Mix Project Tool/)
    assert.doesNotMatch(markup, /ui-stat-chip/)
  } finally {
    restore()
  }
})

test('tool page source routes create actions through host.runTool after a directory prompt', async () => {
  const [pageSource, uiSource, cssSource] = await Promise.all([
    readFile(new URL('../dist/MusicMixProjectToolPage.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/ui.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../dist/music-mix-project-tool.css', import.meta.url), 'utf8'),
  ])

  assert.match(pageSource, /host\.runTool/)
  assert.match(pageSource, /host\.dialog\.openDirectory/)
  assert.match(pageSource, /shell\.openPath/)
  assert.doesNotMatch(pageSource, /context\.storage/)
  assert.doesNotMatch(pageSource, /mmpt-page-header/)
  assert.match(pageSource, /ToolSectionHeader/)
  assert.match(pageSource, /ToolActionBar/)
  assert.match(pageSource, /ToolFieldGrid/)
  assert.doesNotMatch(pageSource, /ToolStat/)
  assert.match(uiSource, /export function ToolSectionHeader/)
  assert.match(uiSource, /export function ToolActionBar/)
  assert.match(uiSource, /export function ToolFieldGrid/)
  assert.match(cssSource, /\.mmpt-preview-path\s*\{/)
  assert.match(cssSource, /\.mmpt-directory-list\s*\{/)
  assert.match(cssSource, /\.mmpt-action-bar\s*\{/)
  assert.match(cssSource, /\.mmpt-grid\s*\{[\s\S]*overflow:\s*hidden;/)
  assert.match(cssSource, /\.mmpt-preview-list\s*\{/)
  assert.match(cssSource, /\.mmpt-panel--folders\s*\{[\s\S]*grid-row:\s*1\s*\/\s*span\s*3;/)
  assert.match(cssSource, /\.mmpt-panel--folders\s*\{[\s\S]*align-self:\s*stretch;/)
  assert.match(cssSource, /\.mmpt-panel--folders\s+\.ui-panel__body\s*\{[\s\S]*max-height:\s*min\(56vh,\s*560px\);[\s\S]*overflow-y:\s*auto;/)
  assert.match(pageSource, /mmpt-directory-row__meta/)
  assert.match(pageSource, /mmpt-directory-field/)
  assert.match(cssSource, /\.mmpt-directory-row\s*\{[\s\S]*box-shadow:\s*inset 0 0 0 1px color-mix/)
  assert.match(cssSource, /\.mmpt-directory-row:is\(:hover,\s*:focus-within\)\s*\{/)
  assert.match(cssSource, /\.mmpt-directory-row__meta\s*\{/)
  assert.match(cssSource, /\.mmpt-directory-toggle input\s*\{[\s\S]*width:\s*16px;[\s\S]*height:\s*16px;/)
  assert.match(cssSource, /\.mmpt-action-bar\s*\{[\s\S]*justify-content:\s*flex-end;/)
})

test('create action calls host.runTool with the normalized project payload', async () => {
  const { pageModule, restore } = await loadPageModuleWithHookHarness({
    1: '2026-05-01',
    2: 'Blue Sky',
    3: [
      { id: 'default-1', label: 'Received', selected: true },
      { id: 'default-2', label: 'Documents', selected: true },
      { id: 'custom-1', label: 'Ignored', selected: false },
    ],
    4: '',
    5: false,
    6: null,
  })
  const calls = []
  const openDirectoryCalls = []
  const host = createHostMock({
    dialog: {
      openDirectory: async () => {
        openDirectoryCalls.push(true)
        return { canceled: false, paths: ['/tmp/mixes'] }
      },
    },
    runTool: async (request) => {
      calls.push(request)
      return {
        jobId: 'job-music-mix-create',
        job: {
          jobId: 'job-music-mix-create',
          capability: 'tool.run',
          state: 'succeeded',
          progress: { current: 1, total: 1, percent: 100 },
          result: {
            summary: 'Music mix project created.',
            result: {
              createdRoot: '/tmp/mixes/260501_Blue Sky',
              createdDirectories: ['01_Received', '02_Documents'],
              createdFiles: [
                '/tmp/mixes/260501_Blue Sky/02_Documents/00_Project_Notes.md',
                '/tmp/mixes/260501_Blue Sky/02_Documents/01_Revision_Log.md',
              ],
            },
          },
        },
      }
    },
  })

  try {
    const tree = pageModule.MusicMixProjectToolPage({
      context: {
        locale: { requested: 'en', resolved: 'en' },
      },
      host,
    })
    const runButton = findElement(
      tree,
      (node) => typeof node.type === 'function' && getElementText(node.props?.children) === 'Create Project',
    )

    assert.ok(runButton, 'expected the page to expose a Create Project action')
    await runButton.props.onClick()
  } finally {
    restore()
  }

  assert.equal(openDirectoryCalls.length, 1)
  assert.deepEqual(calls, [
    {
      toolId: 'music-mix-project-tool',
      input: {
        baseRoot: '/tmp/mixes',
        date: '260501',
        songName: 'Blue Sky',
        sections: ['Received', 'Documents'],
      },
    },
  ])
})

test('runner blocks when the target path already exists', async () => {
  const pluginModule = await loadPluginModule()
  let execCalls = 0

  await assert.rejects(
    () =>
      pluginModule.runMusicMixProjectTool(
        {
          fs: {
            async exists() {
              return true
            },
          },
          process: {
            async execBundled() {
              execCalls += 1
              throw new Error('runner should not execute when the folder already exists')
            },
          },
          locale: { requested: 'en', resolved: 'en' },
        },
        {
          baseRoot: '/tmp/mixes',
          date: '2026-05-01',
          songName: 'Blue Sky',
          sections: ['Received'],
        },
      ),
    /already exists/i,
  )

  assert.equal(execCalls, 0)
})

test('runner executes the bundled create-project script with the expected args', async () => {
  const pluginModule = await loadPluginModule()

  const calls = []
  const result = await pluginModule.runMusicMixProjectTool(
    {
      fs: {
        async exists() {
          return false
        },
      },
      process: {
        async execBundled(resourceId, args) {
          calls.push({ resourceId, args })
          return {
            ok: true,
            exitCode: 0,
            stdout: [
              'CREATED_ROOT=/tmp/mixes/260501_Blue Sky',
              'CREATED_DIR=/tmp/mixes/260501_Blue Sky/01_Received',
              'CREATED_DIR=/tmp/mixes/260501_Blue Sky/02_Documents',
              'CREATED_FILE=/tmp/mixes/260501_Blue Sky/02_Documents/00_Project_Notes.md',
              'CREATED_FILE=/tmp/mixes/260501_Blue Sky/02_Documents/01_Revision_Log.md',
            ].join('\n'),
            stderr: '',
          }
        },
      },
      locale: { requested: 'en', resolved: 'en' },
    },
    {
      baseRoot: '/tmp/mixes',
      date: '2026-05-01',
      songName: 'Blue Sky',
      sections: ['Received', 'Documents'],
    },
  )

  assert.deepEqual(calls, [
    {
      resourceId: 'music-mix-project-script',
      args: [
        '--base-root',
        '/tmp/mixes',
        '--folder-name',
        '260501_Blue Sky',
        '--section',
        '01_Received',
        '--section',
        '02_Documents',
      ],
    },
  ])
  assert.equal(result.result.createdRoot, '/tmp/mixes/260501_Blue Sky')
  assert.deepEqual(result.result.createdDirectories, [
    '/tmp/mixes/260501_Blue Sky/01_Received',
    '/tmp/mixes/260501_Blue Sky/02_Documents',
  ])
  assert.deepEqual(result.result.createdFiles, [
    '/tmp/mixes/260501_Blue Sky/02_Documents/00_Project_Notes.md',
    '/tmp/mixes/260501_Blue Sky/02_Documents/01_Revision_Log.md',
  ])
})

test('bundled shell script creates the expected directories and document files', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'music-mix-project-tool-'))
  const scriptPath = fileURLToPath(new URL('../resources/scripts/create_project.sh', import.meta.url))

  try {
    const execution = await execFile('bash', [
      scriptPath,
      '--base-root',
      tempRoot,
      '--folder-name',
      '260501_Blue Sky',
      '--section',
      '01_Received',
      '--section',
      '02_Documents',
      '--section',
      '03_Archive',
    ])

    const createdRoot = path.join(tempRoot, '260501_Blue Sky')
    const projectNotesPath = path.join(createdRoot, '02_Documents', '00_Project_Notes.md')
    const revisionLogPath = path.join(createdRoot, '02_Documents', '01_Revision_Log.md')

    await access(path.join(createdRoot, '01_Received'))
    await access(path.join(createdRoot, '02_Documents'))
    await access(path.join(createdRoot, '03_Archive'))
    await access(projectNotesPath)
    await access(revisionLogPath)

    const notesSource = await readFile(projectNotesPath, 'utf8')
    const revisionSource = await readFile(revisionLogPath, 'utf8')

    assert.match(execution.stdout, /CREATED_ROOT=/)
    assert.match(execution.stdout, /CREATED_DIR=.*01_Received/)
    assert.match(execution.stdout, /CREATED_FILE=.*00_Project_Notes\.md/)
    assert.match(notesSource, /Project Notes/)
    assert.match(revisionSource, /Revision Log/)
  } finally {
    await rm(tempRoot, { recursive: true, force: true })
  }
})
