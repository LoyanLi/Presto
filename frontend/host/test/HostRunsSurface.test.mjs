import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import { buildAndImportModule } from '../../ui/test/support/esbuildModule.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let runsSurfacePromise = null

async function loadRunsSurface() {
  if (!runsSurfacePromise) {
    runsSurfacePromise = buildAndImportModule({
      repoRoot,
      entryPoint: 'frontend/host/HostRunsSurface.tsx',
      tempPrefix: '.tmp-host-runs-surface-test-',
      outfileName: 'host-runs-surface.mjs',
      loader: {
        '.css': 'text',
      },
    })
  }

  return runsSurfacePromise
}

test('runs surface renders a dedicated empty state when no usage metrics exist', async () => {
  const { HostRunsSurfaceView } = await loadRunsSurface()
  const markup = renderToStaticMarkup(
    React.createElement(HostRunsSurfaceView, {
      locale: 'en',
      summary: {
        totals: { workflowRuns: 0, automationRuns: 0, toolRuns: 0, commandRuns: 0 },
        topWorkflow: null,
        topAutomation: null,
        topTool: null,
        topCommand: null,
        workflows: [],
        automations: [],
        tools: [],
        commands: [],
      },
    }),
  )

  assert.match(markup, />Runs</)
  assert.match(markup, /No successful runs yet/)
  assert.doesNotMatch(markup, /Host overview/)
})

test('runs surface renders translated command labels and ranked usage sections', async () => {
  const { HostRunsSurfaceView } = await loadRunsSurface()
  const markup = renderToStaticMarkup(
    React.createElement(HostRunsSurfaceView, {
      locale: 'en',
      summary: {
        totals: { workflowRuns: 3, automationRuns: 1, toolRuns: 1, commandRuns: 4 },
        topWorkflow: {
          key: 'official.import-workflow.run',
          label: 'Import Workflow',
          count: 3,
          lastUsedAt: '2026-04-12T12:00:00.000Z',
        },
        topAutomation: {
          key: 'official.batch-ara-backup:run',
          label: 'Batch ARA Backup',
          count: 1,
          lastUsedAt: '2026-04-12T11:00:00.000Z',
        },
        topTool: {
          key: 'installed.audio-tools:ec3-decode',
          label: 'EC3 Decode',
          count: 1,
          lastUsedAt: '2026-04-12T10:30:00.000Z',
        },
        topCommand: {
          key: 'workflow.run.start',
          count: 2,
          lastUsedAt: '2026-04-12T10:00:00.000Z',
        },
        workflows: [
          {
            key: 'official.import-workflow.run',
            label: 'Import Workflow',
            count: 3,
            lastUsedAt: '2026-04-12T12:00:00.000Z',
          },
        ],
        automations: [
          {
            key: 'official.batch-ara-backup:run',
            label: 'Batch ARA Backup',
            count: 1,
            lastUsedAt: '2026-04-12T11:00:00.000Z',
          },
        ],
        tools: [
          {
            key: 'installed.audio-tools:ec3-decode',
            label: 'EC3 Decode',
            count: 1,
            lastUsedAt: '2026-04-12T10:30:00.000Z',
          },
        ],
        commands: [
          {
            key: 'workflow.run.start',
            count: 2,
            lastUsedAt: '2026-04-12T10:00:00.000Z',
          },
          {
            key: 'daw.import.analyze',
            count: 2,
            lastUsedAt: '2026-04-12T09:00:00.000Z',
          },
        ],
      },
    }),
  )

  assert.match(markup, />Runs</)
  assert.match(markup, /Workflow runs/)
  assert.match(markup, /Automation runs/)
  assert.match(markup, /Tool runs/)
  assert.match(markup, /Command runs/)
  assert.match(markup, /Import Workflow/)
  assert.match(markup, /Run Workflow/)
  assert.match(markup, /Choose a category to inspect the ranking details/)
  assert.doesNotMatch(markup, /Workflow ranking/)
  assert.doesNotMatch(markup, /Automation ranking/)
  assert.doesNotMatch(markup, /Tool ranking/)
  assert.doesNotMatch(markup, /Command ranking/)
})

test('runs surface renders a single detail ranking with tab switching instead of four parallel lists', async () => {
  const { HostRunsSurfaceView } = await loadRunsSurface()
  const markup = renderToStaticMarkup(
    React.createElement(HostRunsSurfaceView, {
      locale: 'en',
      initialView: 'command',
      summary: {
        totals: { workflowRuns: 3, automationRuns: 1, toolRuns: 1, commandRuns: 4 },
        topWorkflow: {
          key: 'official.import-workflow.run',
          label: 'Import Workflow',
          count: 3,
          lastUsedAt: '2026-04-12T12:00:00.000Z',
        },
        topAutomation: {
          key: 'official.batch-ara-backup:run',
          label: 'Batch ARA Backup',
          count: 1,
          lastUsedAt: '2026-04-12T11:00:00.000Z',
        },
        topTool: {
          key: 'installed.audio-tools:ec3-decode',
          label: 'EC3 Decode',
          count: 1,
          lastUsedAt: '2026-04-12T10:30:00.000Z',
        },
        topCommand: {
          key: 'workflow.run.start',
          count: 2,
          lastUsedAt: '2026-04-12T10:00:00.000Z',
        },
        workflows: [
          {
            key: 'official.import-workflow.run',
            label: 'Import Workflow',
            count: 3,
            lastUsedAt: '2026-04-12T12:00:00.000Z',
          },
        ],
        automations: [
          {
            key: 'official.batch-ara-backup:run',
            label: 'Batch ARA Backup',
            count: 1,
            lastUsedAt: '2026-04-12T11:00:00.000Z',
          },
        ],
        tools: [
          {
            key: 'installed.audio-tools:ec3-decode',
            label: 'EC3 Decode',
            count: 1,
            lastUsedAt: '2026-04-12T10:30:00.000Z',
          },
        ],
        commands: [
          {
            key: 'workflow.run.start',
            count: 2,
            lastUsedAt: '2026-04-12T10:00:00.000Z',
          },
          {
            key: 'daw.import.analyze',
            count: 2,
            lastUsedAt: '2026-04-12T09:00:00.000Z',
          },
        ],
      },
    }),
  )

  assert.match(markup, /Back to overview/)
  assert.match(markup, /Workflow runs \(3\)/)
  assert.match(markup, /Automation runs \(1\)/)
  assert.match(markup, /Tool runs \(1\)/)
  assert.match(markup, /Command runs \(4\)/)
  assert.match(markup, /Command ranking/)
  assert.match(markup, /Run Workflow/)
  assert.match(markup, /Analyze Import Source/)
  assert.doesNotMatch(markup, />Workflow ranking</)
  assert.doesNotMatch(markup, />Automation ranking</)
  assert.doesNotMatch(markup, />Tool ranking</)
})

test('runs surface renders translated workflow-step command labels in zh-CN detail mode', async () => {
  const { HostRunsSurfaceView } = await loadRunsSurface()
  const markup = renderToStaticMarkup(
    React.createElement(HostRunsSurfaceView, {
      locale: 'zh-CN',
      initialView: 'command',
      summary: {
        totals: { workflowRuns: 1, automationRuns: 0, toolRuns: 1, commandRuns: 2 },
        topWorkflow: {
          key: 'official.import-workflow.run',
          label: '导入工作流',
          count: 1,
          lastUsedAt: '2026-04-12T12:00:00.000Z',
        },
        topAutomation: null,
        topTool: {
          key: 'installed.audio-tools:ixml-delete',
          label: '删除 iXML',
          count: 1,
          lastUsedAt: '2026-04-12T11:00:00.000Z',
        },
        topCommand: {
          key: 'daw.editing.createFadesBasedOnPreset',
          count: 1,
          lastUsedAt: '2026-04-12T10:00:00.000Z',
        },
        workflows: [
          {
            key: 'official.import-workflow.run',
            label: '导入工作流',
            count: 1,
            lastUsedAt: '2026-04-12T12:00:00.000Z',
          },
        ],
        automations: [],
        tools: [
          {
            key: 'installed.audio-tools:ixml-delete',
            label: '删除 iXML',
            count: 1,
            lastUsedAt: '2026-04-12T11:00:00.000Z',
          },
        ],
        commands: [
          {
            key: 'daw.editing.createFadesBasedOnPreset',
            count: 1,
            lastUsedAt: '2026-04-12T10:00:00.000Z',
          },
          {
            key: 'daw.clip.selectAllOnTrack',
            count: 1,
            lastUsedAt: '2026-04-12T09:00:00.000Z',
          },
        ],
      },
    }),
  )

  assert.match(markup, /按预设创建淡变/)
  assert.match(markup, /选中轨道上的全部片段/)
  assert.doesNotMatch(markup, /createFadesBasedOnPreset/)
  assert.doesNotMatch(markup, /selectAllOnTrack/)
})

test('runs surface prefers current localized workflow and automation labels over stale stored labels', async () => {
  const { HostRunsSurfaceView } = await loadRunsSurface()
  const markup = renderToStaticMarkup(
    React.createElement(HostRunsSurfaceView, {
      locale: 'zh-CN',
      initialView: 'workflow',
      summary: {
        totals: { workflowRuns: 3, automationRuns: 1, toolRuns: 0, commandRuns: 0 },
        topWorkflow: {
          key: 'official.import-workflow.run',
          label: 'Import Workflow',
          count: 3,
          lastUsedAt: '2026-04-12T12:00:00.000Z',
        },
        topAutomation: {
          key: 'official.batch-ara-backup:run',
          label: 'Batch ARA Backup',
          count: 1,
          lastUsedAt: '2026-04-12T11:00:00.000Z',
        },
        topTool: null,
        topCommand: null,
        workflows: [
          {
            key: 'official.import-workflow.run',
            label: 'Import Workflow',
            count: 3,
            lastUsedAt: '2026-04-12T12:00:00.000Z',
          },
        ],
        automations: [
          {
            key: 'official.batch-ara-backup:run',
            label: 'Batch ARA Backup',
            count: 1,
            lastUsedAt: '2026-04-12T11:00:00.000Z',
          },
        ],
        tools: [],
        commands: [],
      },
      labelOverrides: {
        workflow: {
          'official.import-workflow.run': '导入流程',
        },
        automation: {
          'official.batch-ara-backup:run': '批量 ARA 备份',
        },
      },
    }),
  )

  assert.match(markup, /导入流程/)
  assert.doesNotMatch(markup, /Import Workflow/)
  assert.doesNotMatch(markup, /Batch ARA Backup/)
})

test('runs surface keeps partially empty categories inside overview cards and detail lists', async () => {
  const { HostRunsSurfaceView } = await loadRunsSurface()
  const overviewMarkup = renderToStaticMarkup(
    React.createElement(HostRunsSurfaceView, {
      locale: 'en',
      summary: {
        totals: { workflowRuns: 0, automationRuns: 0, toolRuns: 0, commandRuns: 2 },
        topWorkflow: null,
        topAutomation: null,
        topTool: null,
        topCommand: {
          key: 'workflow.run.start',
          count: 2,
          lastUsedAt: '2026-04-12T10:00:00.000Z',
        },
        workflows: [],
        automations: [],
        tools: [],
        commands: [
          {
            key: 'workflow.run.start',
            count: 2,
            lastUsedAt: '2026-04-12T10:00:00.000Z',
          },
        ],
      },
    }),
  )

  const detailMarkup = renderToStaticMarkup(
    React.createElement(HostRunsSurfaceView, {
      locale: 'en',
      initialView: 'workflow',
      summary: {
        totals: { workflowRuns: 0, automationRuns: 0, toolRuns: 0, commandRuns: 2 },
        topWorkflow: null,
        topAutomation: null,
        topTool: null,
        topCommand: {
          key: 'workflow.run.start',
          count: 2,
          lastUsedAt: '2026-04-12T10:00:00.000Z',
        },
        workflows: [],
        automations: [],
        tools: [],
        commands: [
          {
            key: 'workflow.run.start',
            count: 2,
            lastUsedAt: '2026-04-12T10:00:00.000Z',
          },
        ],
      },
    }),
  )

  assert.match(overviewMarkup, /No successful runs yet/)
  assert.match(overviewMarkup, /Command runs/)
  assert.match(detailMarkup, /Workflow ranking/)
  assert.match(detailMarkup, /No data yet/)
})

test('runs surface keeps overview and detail scrolling inside the content region', async () => {
  const { HostRunsSurfaceView } = await loadRunsSurface()
  const markup = renderToStaticMarkup(
    React.createElement(HostRunsSurfaceView, {
      locale: 'en',
      initialView: 'workflow',
      summary: {
        totals: { workflowRuns: 6, automationRuns: 4, toolRuns: 2, commandRuns: 8 },
        topWorkflow: {
          key: 'official.import-workflow.run',
          label: 'Import Workflow',
          count: 3,
          lastUsedAt: '2026-04-12T12:00:00.000Z',
        },
        topAutomation: {
          key: 'official.batch-ara-backup:run',
          label: 'Batch ARA Backup',
          count: 2,
          lastUsedAt: '2026-04-12T11:00:00.000Z',
        },
        topTool: {
          key: 'installed.audio-tools:ec3-decode',
          label: 'EC3 Decode',
          count: 2,
          lastUsedAt: '2026-04-12T11:30:00.000Z',
        },
        topCommand: {
          key: 'workflow.run.start',
          count: 4,
          lastUsedAt: '2026-04-12T10:00:00.000Z',
        },
        workflows: [
          {
            key: 'official.import-workflow.run',
            label: 'Import Workflow',
            count: 3,
            lastUsedAt: '2026-04-12T12:00:00.000Z',
          },
          {
            key: 'official.cleanup-workflow.run',
            label: 'Cleanup Workflow',
            count: 3,
            lastUsedAt: '2026-04-12T08:00:00.000Z',
          },
        ],
        automations: [
          {
            key: 'official.batch-ara-backup:run',
            label: 'Batch ARA Backup',
            count: 2,
            lastUsedAt: '2026-04-12T11:00:00.000Z',
          },
          {
            key: 'official.stereo-split:run',
            label: 'Split Stereo to Mono',
            count: 2,
            lastUsedAt: '2026-04-12T09:00:00.000Z',
          },
        ],
        tools: [
          {
            key: 'installed.audio-tools:ec3-decode',
            label: 'EC3 Decode',
            count: 2,
            lastUsedAt: '2026-04-12T11:30:00.000Z',
          },
        ],
        commands: [
          {
            key: 'workflow.run.start',
            count: 4,
            lastUsedAt: '2026-04-12T10:00:00.000Z',
          },
          {
            key: 'daw.import.analyze',
            count: 4,
            lastUsedAt: '2026-04-12T09:00:00.000Z',
          },
        ],
      },
    }),
  )

  assert.match(markup, /grid-template-rows:auto minmax\(0, 1fr\)/)
  assert.match(markup, /container-type:inline-size/)
  assert.match(markup, /overflow:hidden/)
  assert.match(markup, /overflow-y:auto/)
  assert.match(markup, /Workflow ranking/)
  assert.doesNotMatch(markup, /Automation ranking/)
  assert.doesNotMatch(markup, /Tool ranking/)
  assert.doesNotMatch(markup, /Command ranking/)
})
