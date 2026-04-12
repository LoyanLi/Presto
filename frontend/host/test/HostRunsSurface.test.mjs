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
        totals: { workflowRuns: 0, automationRuns: 0, commandRuns: 0 },
        topWorkflow: null,
        topAutomation: null,
        topCommand: null,
        workflows: [],
        automations: [],
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
        totals: { workflowRuns: 3, automationRuns: 1, commandRuns: 4 },
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
  assert.match(markup, /Run Workflow/)
  assert.match(markup, /Analyze Import Source/)
  assert.match(markup, /Workflow ranking/)
  assert.match(markup, /Automation ranking/)
  assert.match(markup, /Command ranking/)
  assert.doesNotMatch(markup, /COUNT/)
  assert.doesNotMatch(markup, /presto-stat-chip/)
  assert.doesNotMatch(markup, /presto-page-header/)
  assert.doesNotMatch(markup, /Run metrics/)
  assert.doesNotMatch(markup, /Most-used workflow/)
  assert.doesNotMatch(markup, /Most-used automation/)
  assert.doesNotMatch(markup, /Most-used command/)
  assert.doesNotMatch(markup, /Successful usage totals/)
  assert.doesNotMatch(markup, /max-width:1120px/)
})

test('runs surface renders translated workflow-step command labels in zh-CN', async () => {
  const { HostRunsSurfaceView } = await loadRunsSurface()
  const markup = renderToStaticMarkup(
    React.createElement(HostRunsSurfaceView, {
      locale: 'zh-CN',
      summary: {
        totals: { workflowRuns: 1, automationRuns: 0, commandRuns: 2 },
        topWorkflow: {
          key: 'official.import-workflow.run',
          label: '导入工作流',
          count: 1,
          lastUsedAt: '2026-04-12T12:00:00.000Z',
        },
        topAutomation: null,
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

test('runs surface keeps partially empty ranking sections within the same card language', async () => {
  const { HostRunsSurfaceView } = await loadRunsSurface()
  const markup = renderToStaticMarkup(
    React.createElement(HostRunsSurfaceView, {
      locale: 'en',
      summary: {
        totals: { workflowRuns: 0, automationRuns: 0, commandRuns: 2 },
        topWorkflow: null,
        topAutomation: null,
        topCommand: {
          key: 'workflow.run.start',
          count: 2,
          lastUsedAt: '2026-04-12T10:00:00.000Z',
        },
        workflows: [],
        automations: [],
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

  assert.equal((markup.match(/surface-container-low/g) || []).length, 3)
  assert.match(markup, /Workflow ranking/)
  assert.match(markup, /Automation ranking/)
  assert.match(markup, /Command ranking/)
  assert.match(markup, /No data yet/)
})

test('runs surface keeps a strict three-column-or-one-column grid and confines scrolling to card bodies', async () => {
  const { HostRunsSurfaceView } = await loadRunsSurface()
  const markup = renderToStaticMarkup(
    React.createElement(HostRunsSurfaceView, {
      locale: 'en',
      summary: {
        totals: { workflowRuns: 6, automationRuns: 4, commandRuns: 8 },
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
  assert.match(markup, /grid-auto-rows:minmax\(0, 1fr\)/)
  assert.match(markup, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/)
  assert.match(markup, /container-type:inline-size/)
  assert.match(markup, /@container \(max-width: 759px\)/)
  assert.match(markup, /grid-template-columns:\s*minmax\(0, 1fr\)/)
  assert.doesNotMatch(markup, /auto-fit/)
  assert.match(markup, /overflow:hidden/)
  assert.equal((markup.match(/overflow-y:auto/g) || []).length, 3)
})
