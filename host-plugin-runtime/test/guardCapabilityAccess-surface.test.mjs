import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import esbuild from 'esbuild'

const currentDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(currentDir, '../..')

let guardCapabilityAccessPromise = null

async function loadGuardCapabilityAccess() {
  if (!guardCapabilityAccessPromise) {
    guardCapabilityAccessPromise = (async () => {
      const entry = path.join(repoRoot, 'host-plugin-runtime/src/permissions/guardCapabilityAccess.ts')
      const buildResult = await esbuild.build({
        entryPoints: [entry],
        absWorkingDir: repoRoot,
        bundle: true,
        format: 'esm',
        platform: 'node',
        write: false,
        target: 'node20',
      })
      const source = buildResult.outputFiles[0]?.text
      if (!source) {
        throw new Error('Failed to compile guardCapabilityAccess.ts')
      }
      const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
      const loaded = await import(moduleUrl)
      return loaded.guardCapabilityAccess
    })()
  }

  return guardCapabilityAccessPromise
}

function createPrestoFixture(invocations) {
  return {
    system: {
      async health() {
        invocations.push({ method: 'system.health' })
        return { ok: true }
      },
    },
    config: {
      async get() {
        invocations.push({ method: 'config.get' })
        return { ok: true }
      },
      async update(request) {
        invocations.push({ method: 'config.update', request })
        return { ok: true }
      },
    },
    daw: {
      connection: {
        async connect(request) {
          invocations.push({ method: 'daw.connection.connect', request })
          return { ok: true }
        },
        async disconnect() {
          invocations.push({ method: 'daw.connection.disconnect' })
          return { ok: true }
        },
        async getStatus() {
          invocations.push({ method: 'daw.connection.getStatus' })
          return { ok: true }
        },
      },
    },
    session: {
      async getInfo() {
        invocations.push({ method: 'daw.session.getInfo' })
        return { ok: true }
      },
      async getLength() {
        invocations.push({ method: 'daw.session.getLength' })
        return { ok: true }
      },
      async save() {
        invocations.push({ method: 'daw.session.save' })
        return { ok: true }
      },
      async applySnapshot(request) {
        invocations.push({ method: 'daw.session.applySnapshot', request })
        return { ok: true }
      },
      async getSnapshotInfo(request) {
        invocations.push({ method: 'daw.session.getSnapshotInfo', request })
        return { ok: true }
      },
    },
    track: {
      async list() {
        invocations.push({ method: 'daw.track.list' })
        return { tracks: [] }
      },
      async listNames() {
        invocations.push({ method: 'daw.track.listNames' })
        return { names: [] }
      },
      async rename(request) {
        invocations.push({ method: 'daw.track.rename', request })
        return { ok: true }
      },
      async select(request) {
        invocations.push({ method: 'daw.track.select', request })
        return { ok: true }
      },
      color: {
        async apply(request) {
          invocations.push({ method: 'daw.track.color.apply', request })
          return { ok: true }
        },
      },
      mute: {
        async set(request) {
          invocations.push({ method: 'daw.track.mute.set', request })
          return { ok: true }
        },
      },
      solo: {
        async set(request) {
          invocations.push({ method: 'daw.track.solo.set', request })
          return { ok: true }
        },
      },
    },
    clip: {
      async selectAllOnTrack(request) {
        invocations.push({ method: 'daw.clip.selectAllOnTrack', request })
        return { ok: true }
      },
    },
    transport: {
      async play() {
        invocations.push({ method: 'daw.transport.play' })
        return { ok: true }
      },
      async stop() {
        invocations.push({ method: 'daw.transport.stop' })
        return { ok: true }
      },
      async record() {
        invocations.push({ method: 'daw.transport.record' })
        return { ok: true }
      },
      async getStatus() {
        invocations.push({ method: 'daw.transport.getStatus' })
        return { ok: true }
      },
    },
    workflow: {
      run: {
        async start(request) {
          invocations.push({ method: 'workflow.run.start', request })
          return { jobId: 'workflow-job-1', state: 'queued' }
        },
      },
    },
    import: {
      async analyze(request) {
        invocations.push({ method: 'daw.import.analyze', request })
        return { rows: [], folderSummaries: [] }
      },
      cache: {
        async save(request) {
          invocations.push({ method: 'daw.import.cache.save', request })
          return { ok: true, saved: true }
        },
      },
      run: {
        async start(request) {
          invocations.push({ method: 'daw.import.run.start', request })
          return { ok: true }
        },
      },
    },
    stripSilence: {
      async open() {
        invocations.push({ method: 'daw.stripSilence.open' })
        return { ok: true }
      },
      async execute(request) {
        invocations.push({ method: 'daw.stripSilence.execute', request })
        return { ok: true }
      },
    },
    export: {
      range: {
        async set(request) {
          invocations.push({ method: 'daw.export.range.set', request })
          return { ok: true }
        },
      },
      async start(request) {
        invocations.push({ method: 'daw.export.start', request })
        return { ok: true }
      },
      direct: {
        async start(request) {
          invocations.push({ method: 'daw.export.direct.start', request })
          return { ok: true }
        },
      },
      mixSource: {
        async list(request) {
          invocations.push({ method: 'export.mixSource.list', request })
          return { sourceType: request.sourceType, sourceList: ['MainMix'] }
        },
      },
      run: {
        async start(request) {
          invocations.push({ method: 'daw.export.run.start', request })
          return { ok: true }
        },
      },
    },
    jobs: {
      async create(request) {
        invocations.push({ method: 'jobs.create', request })
        return { job: { jobId: 'job-1' } }
      },
      async update(request) {
        invocations.push({ method: 'jobs.update', request })
        return { job: { jobId: request.jobId ?? 'job-1' } }
      },
      async get(jobId) {
        invocations.push({ method: 'jobs.get', jobId })
        return { jobId }
      },
      async list(filter) {
        invocations.push({ method: 'jobs.list', filter })
        return { jobs: [], totalCount: 0 }
      },
      async cancel(jobId) {
        invocations.push({ method: 'jobs.cancel', jobId })
        return { cancelled: true, jobId }
      },
      async delete(jobId) {
        invocations.push({ method: 'jobs.delete', jobId })
        return { deleted: true, jobId }
      },
    },
  }
}

test('guardCapabilityAccess exposes current clip/import/export surfaces and removes stale ai/import legacy methods', async () => {
  const guardCapabilityAccess = await loadGuardCapabilityAccess()
  const invocations = []
  const presto = createPrestoFixture(invocations)
  const manifest = {
    pluginId: 'plugin.guard.surface',
    requiredCapabilities: ['daw.clip.selectAllOnTrack', 'daw.import.run.start', 'daw.export.mixWithSource', 'daw.export.run.start', 'jobs.create', 'jobs.update'],
  }

  const guarded = guardCapabilityAccess(presto, manifest)

  assert.equal('ai' in guarded, false)
  assert.equal('preflight' in guarded.import, false)
  assert.equal('finalize' in guarded.import, false)
  assert.equal('analyze' in guarded.import, true)
  assert.equal('cache' in guarded.import, true)

  await guarded.clip.selectAllOnTrack({ trackName: 'Vox' })
  await guarded.import.run.start({ folderPaths: ['/tmp/import'] })
  await guarded.export.mixSource.list({ sourceType: 'output' })
  await guarded.export.run.start({ snapshotIds: ['snapshot-1'], exportSettings: { output_path: '/tmp/out' } })
  await guarded.jobs.create({ capability: 'jobs.get', targetDaw: 'pro_tools' })
  await guarded.jobs.update({ jobId: 'job-1', state: 'running' })

  assert.deepEqual(invocations, [
    { method: 'daw.clip.selectAllOnTrack', request: { trackName: 'Vox' } },
    { method: 'daw.import.run.start', request: { folderPaths: ['/tmp/import'] } },
    { method: 'export.mixSource.list', request: { sourceType: 'output' } },
    { method: 'daw.export.run.start', request: { snapshotIds: ['snapshot-1'], exportSettings: { output_path: '/tmp/out' } } },
    { method: 'jobs.create', request: { capability: 'jobs.get', targetDaw: 'pro_tools' } },
    { method: 'jobs.update', request: { jobId: 'job-1', state: 'running' } },
  ])
})

test('guardCapabilityAccess exposes workflow run surface for workflow plugins', async () => {
  const guardCapabilityAccess = await loadGuardCapabilityAccess()
  const invocations = []
  const presto = createPrestoFixture(invocations)
  const manifest = {
    pluginId: 'plugin.guard.workflow-surface',
    requiredCapabilities: ['workflow.run.start'],
  }

  const guarded = guardCapabilityAccess(presto, manifest)
  const response = await guarded.workflow.run.start({
    pluginId: 'plugin.guard.workflow-surface',
    workflowId: 'official.export-workflow.run',
    input: { snapshots: [] },
  })

  assert.deepEqual(response, { jobId: 'workflow-job-1', state: 'queued' })
  assert.deepEqual(invocations, [
    {
      method: 'workflow.run.start',
      request: {
        pluginId: 'plugin.guard.workflow-surface',
        workflowId: 'official.export-workflow.run',
        input: { snapshots: [] },
      },
    },
  ])
})

test('guardCapabilityAccess still denies undeclared current capabilities', async () => {
  const guardCapabilityAccess = await loadGuardCapabilityAccess()
  const presto = createPrestoFixture([])
  const manifest = {
    pluginId: 'plugin.guard.denied',
    requiredCapabilities: ['daw.import.run.start'],
  }

  const guarded = guardCapabilityAccess(presto, manifest)
  await assert.rejects(
    async () => guarded.clip.selectAllOnTrack({ trackName: 'Kick' }),
    (error) =>
      error instanceof Error &&
      error.name === 'PluginPermissionError' &&
      error.code === 'PLUGIN_PERMISSION_DENIED' &&
      String(error.message).includes('daw.clip.selectAllOnTrack()'),
  )
})

test('guardCapabilityAccess does not require unrelated presto services for declared capabilities', async () => {
  const guardCapabilityAccess = await loadGuardCapabilityAccess()
  const invocations = []
  const presto = {
    export: {
      run: {
        async start(request) {
          invocations.push({ method: 'daw.export.run.start', request })
          return { ok: true }
        },
      },
    },
    jobs: {
      async get(jobId) {
        invocations.push({ method: 'jobs.get', jobId })
        return { jobId }
      },
    },
  }
  const manifest = {
    pluginId: 'plugin.guard.minimal-services',
    requiredCapabilities: ['daw.export.run.start', 'jobs.get'],
  }

  const guarded = guardCapabilityAccess(presto, manifest)
  await guarded.export.run.start({ snapshots: [], export_settings: { output_path: '/tmp/out' } })
  await guarded.jobs.get('job-1')

  assert.deepEqual(invocations, [
    { method: 'daw.export.run.start', request: { snapshots: [], export_settings: { output_path: '/tmp/out' } } },
    { method: 'jobs.get', jobId: 'job-1' },
  ])
})

test('guardCapabilityAccess exposes backend import analyze and cache save capabilities', async () => {
  const guardCapabilityAccess = await loadGuardCapabilityAccess()
  const invocations = []
  const presto = createPrestoFixture(invocations)
  const manifest = {
    pluginId: 'plugin.guard.import-backend',
    requiredCapabilities: ['daw.import.analyze', 'daw.import.cache.save'],
  }

  const guarded = guardCapabilityAccess(presto, manifest)
  await guarded.import.analyze({ folderPaths: ['/tmp/import'], categories: [] })
  await guarded.import.cache.save({ folderPath: '/tmp/import', payload: { version: 1 } })

  assert.deepEqual(invocations, [
    { method: 'daw.import.analyze', request: { folderPaths: ['/tmp/import'], categories: [] } },
    { method: 'daw.import.cache.save', request: { folderPath: '/tmp/import', payload: { version: 1 } } },
  ])
})

test('guardCapabilityAccess records workflow job metrics from jobs.get while counting workflow.run.start only as a command', async () => {
  const guardCapabilityAccess = await loadGuardCapabilityAccess()
  const presto = createPrestoFixture([])
  const metricsEvents = []
  const manifest = {
    pluginId: 'plugin.guard.metrics',
    displayName: 'Guard Metrics Workflow',
    requiredCapabilities: ['workflow.run.start', 'jobs.get'],
  }

  const guarded = guardCapabilityAccess(presto, manifest, {
    recordCommandSuccess(capabilityId) {
      metricsEvents.push({ kind: 'command', capabilityId })
    },
    recordWorkflowJobSuccess(input) {
      metricsEvents.push({ kind: 'workflowJob', ...input })
    },
  })

  await guarded.workflow.run.start({
    pluginId: 'plugin.guard.metrics',
    workflowId: 'official.export-workflow.run',
    input: {},
  })
  presto.jobs.get = async (jobId) => ({
    jobId,
    capability: 'workflow.run.start',
    targetDaw: 'pro_tools',
    state: 'succeeded',
    progress: {
      phase: 'succeeded',
      current: 2,
      total: 2,
      percent: 100,
      message: 'Workflow completed.',
    },
    metadata: {
      pluginId: 'plugin.guard.metrics',
      workflowId: 'official.export-workflow.run',
    },
    result: {
      workflowId: 'official.export-workflow.run',
      steps: {},
      metrics: {
        schemaVersion: 1,
        workflowId: 'official.export-workflow.run',
        commandCounts: {
          'daw.export.run.start': 1,
          'daw.session.save': 1,
        },
      },
    },
    createdAt: '2026-04-12T10:00:00.000Z',
    finishedAt: '2026-04-12T10:01:00.000Z',
  })
  await guarded.jobs.get('job-1')

  assert.deepEqual(metricsEvents, [
    { kind: 'command', capabilityId: 'workflow.run.start' },
    {
      kind: 'workflowJob',
      jobId: 'job-1',
      workflowId: 'official.export-workflow.run',
      pluginId: 'plugin.guard.metrics',
      label: 'Guard Metrics Workflow',
      commandCounts: {
        'daw.export.run.start': 1,
        'daw.session.save': 1,
      },
      at: '2026-04-12T10:01:00.000Z',
    },
  ])
})

test('guardCapabilityAccess records tool job metrics from jobs.get without inflating command totals', async () => {
  const guardCapabilityAccess = await loadGuardCapabilityAccess()
  const presto = createPrestoFixture([])
  const metricsEvents = []
  const manifest = {
    pluginId: 'plugin.guard.tools',
    displayName: 'Guard Tools',
    requiredCapabilities: ['jobs.get'],
  }

  const guarded = guardCapabilityAccess(presto, manifest, {
    recordCommandSuccess(capabilityId) {
      metricsEvents.push({ kind: 'command', capabilityId })
    },
    recordToolRunSuccess(input) {
      metricsEvents.push({ kind: 'toolJob', ...input })
    },
  })

  presto.jobs.get = async (jobId) => ({
    jobId,
    capability: 'tool.run',
    targetDaw: 'host',
    state: 'succeeded',
    metadata: {
      pluginId: 'plugin.guard.tools',
      toolId: 'ec3-decode',
      toolTitle: 'EC3 Decode',
    },
    result: {
      metrics: {
        toolId: 'ec3-decode',
      },
    },
    finishedAt: '2026-04-12T11:45:00.000Z',
  })

  await guarded.jobs.get('tool-job-1')

  assert.deepEqual(metricsEvents, [
    {
      kind: 'toolJob',
      jobId: 'tool-job-1',
      toolKey: 'plugin.guard.tools:ec3-decode',
      label: 'EC3 Decode',
      at: '2026-04-12T11:45:00.000Z',
    },
  ])
})

test('guardCapabilityAccess does not record failed capability executions', async () => {
  const guardCapabilityAccess = await loadGuardCapabilityAccess()
  const metricsEvents = []
  const presto = {
    workflow: {
      run: {
        async start() {
          throw new Error('workflow_failed')
        },
      },
    },
  }
  const manifest = {
    pluginId: 'plugin.guard.metrics-failure',
    requiredCapabilities: ['workflow.run.start'],
  }

  const guarded = guardCapabilityAccess(presto, manifest, {
    recordCommandSuccess(capabilityId) {
      metricsEvents.push({ kind: 'command', capabilityId })
    },
    recordWorkflowJobSuccess(input) {
      metricsEvents.push({ kind: 'workflowJob', ...input })
    },
  })

  await assert.rejects(
    async () => guarded.workflow.run.start({ pluginId: 'plugin.guard.metrics-failure', workflowId: 'workflow-1', input: {} }),
    /workflow_failed/,
  )
  assert.deepEqual(metricsEvents, [])
})
