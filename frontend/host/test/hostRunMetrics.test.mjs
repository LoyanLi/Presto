import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { buildAndImportModule } from '../../ui/test/support/esbuildModule.mjs'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../../..')

let hostRunMetricsPromise = null

class MemoryStorage {
  #store = new Map()

  getItem(key) {
    return this.#store.has(key) ? this.#store.get(key) : null
  }

  setItem(key, value) {
    this.#store.set(key, String(value))
  }

  removeItem(key) {
    this.#store.delete(key)
  }
}

async function loadHostRunMetrics() {
  if (!hostRunMetricsPromise) {
    hostRunMetricsPromise = buildAndImportModule({
      repoRoot,
      entryPoint: 'frontend/host/hostRunMetrics.ts',
      tempPrefix: '.tmp-host-run-metrics-test-',
      outfileName: 'host-run-metrics.mjs',
      jsx: false,
    })
  }

  return hostRunMetricsPromise
}

test.afterEach(async () => {
  const module = await loadHostRunMetrics()
  module.resetHostRunMetricsForTesting()
  Reflect.deleteProperty(globalThis, 'localStorage')
})

test('host run metrics falls back to an empty snapshot when storage payload is invalid', async () => {
  const module = await loadHostRunMetrics()
  const storage = new MemoryStorage()
  globalThis.localStorage = storage
  storage.setItem(module.HOST_RUN_METRICS_STORAGE_KEY, '{not-json')

  const snapshot = module.hydrateHostRunMetricsState()

  assert.deepEqual(snapshot, {
    version: 2,
    workflows: {},
    automations: {},
    commands: {},
    processedWorkflowJobs: {},
  })
})

test('host run metrics records workflow-job metrics exactly once and keeps command totals aligned with executed steps', async () => {
  const module = await loadHostRunMetrics()
  const storage = new MemoryStorage()
  globalThis.localStorage = storage

  module.hydrateHostRunMetricsState()
  module.recordWorkflowJobSuccess({
    jobId: 'workflow-job-1',
    workflowId: 'official.import-workflow.run',
    label: 'Import Workflow',
    commandCounts: {
      'daw.import.run.start': 1,
      'daw.track.rename': 2,
      'daw.track.color.apply': 1,
    },
    at: '2026-04-12T14:00:00.000Z',
  })
  module.recordWorkflowJobSuccess({
    jobId: 'workflow-job-1',
    workflowId: 'official.import-workflow.run',
    label: 'Import Workflow',
    commandCounts: {
      'daw.import.run.start': 1,
      'daw.track.rename': 2,
      'daw.track.color.apply': 1,
    },
    at: '2026-04-12T15:00:00.000Z',
  })
  module.recordAutomationRunSuccess({
    automationKey: 'official.batch-ara-backup:run',
    label: 'Batch ARA Backup',
    at: '2026-04-12T12:00:00.000Z',
  })
  module.recordCommandRunSuccess({
    capabilityId: 'daw.import.analyze',
    at: '2026-04-12T08:00:00.000Z',
  })
  module.recordCommandRunSuccess({
    capabilityId: 'daw.import.analyze',
    at: '2026-04-12T13:00:00.000Z',
  })
  module.recordCommandRunSuccess({
    capabilityId: 'workflow.run.start',
    at: '2026-04-12T14:00:00.000Z',
  })

  const summary = module.createHostRunMetricsSummary()
  const persisted = JSON.parse(storage.getItem(module.HOST_RUN_METRICS_STORAGE_KEY))

  assert.deepEqual(summary.totals, {
    workflowRuns: 1,
    automationRuns: 1,
    commandRuns: 7,
  })
  assert.equal(summary.topWorkflow?.key, 'official.import-workflow.run')
  assert.equal(summary.topWorkflow?.count, 1)
  assert.equal(summary.topAutomation?.key, 'official.batch-ara-backup:run')
  assert.equal(summary.topCommand?.key, 'daw.track.rename')
  assert.deepEqual(
    summary.commands.map((entry) => [entry.key, entry.count]),
    [
      ['daw.track.rename', 2],
      ['daw.import.analyze', 2],
      ['daw.import.run.start', 1],
      ['daw.track.color.apply', 1],
      ['workflow.run.start', 1],
    ],
  )
  assert.equal(persisted.version, 2)
  assert.equal(persisted.workflows['official.import-workflow.run'].lastUsedAt, '2026-04-12T14:00:00.000Z')
  assert.equal(persisted.automations['official.batch-ara-backup:run'].label, 'Batch ARA Backup')
  assert.equal(persisted.processedWorkflowJobs['workflow-job-1'], '2026-04-12T14:00:00.000Z')
})
