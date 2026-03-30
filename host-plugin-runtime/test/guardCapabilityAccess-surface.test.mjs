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
        invocations.push({ method: 'session.getInfo' })
        return { ok: true }
      },
      async getLength() {
        invocations.push({ method: 'session.getLength' })
        return { ok: true }
      },
      async save() {
        invocations.push({ method: 'session.save' })
        return { ok: true }
      },
      async applySnapshot(request) {
        invocations.push({ method: 'session.applySnapshot', request })
        return { ok: true }
      },
      async getSnapshotInfo(request) {
        invocations.push({ method: 'session.getSnapshotInfo', request })
        return { ok: true }
      },
    },
    track: {
      async list() {
        invocations.push({ method: 'track.list' })
        return { tracks: [] }
      },
      async listNames() {
        invocations.push({ method: 'track.listNames' })
        return { names: [] }
      },
      async rename(request) {
        invocations.push({ method: 'track.rename', request })
        return { ok: true }
      },
      async select(request) {
        invocations.push({ method: 'track.select', request })
        return { ok: true }
      },
      color: {
        async apply(request) {
          invocations.push({ method: 'track.color.apply', request })
          return { ok: true }
        },
      },
      mute: {
        async set(request) {
          invocations.push({ method: 'track.mute.set', request })
          return { ok: true }
        },
      },
      solo: {
        async set(request) {
          invocations.push({ method: 'track.solo.set', request })
          return { ok: true }
        },
      },
    },
    clip: {
      async selectAllOnTrack(request) {
        invocations.push({ method: 'clip.selectAllOnTrack', request })
        return { ok: true }
      },
    },
    transport: {
      async play() {
        invocations.push({ method: 'transport.play' })
        return { ok: true }
      },
      async stop() {
        invocations.push({ method: 'transport.stop' })
        return { ok: true }
      },
      async record() {
        invocations.push({ method: 'transport.record' })
        return { ok: true }
      },
      async getStatus() {
        invocations.push({ method: 'transport.getStatus' })
        return { ok: true }
      },
    },
    import: {
      run: {
        async start(request) {
          invocations.push({ method: 'import.run.start', request })
          return { ok: true }
        },
      },
    },
    stripSilence: {
      async open() {
        invocations.push({ method: 'stripSilence.open' })
        return { ok: true }
      },
      async execute(request) {
        invocations.push({ method: 'stripSilence.execute', request })
        return { ok: true }
      },
    },
    export: {
      range: {
        async set(request) {
          invocations.push({ method: 'export.range.set', request })
          return { ok: true }
        },
      },
      async start(request) {
        invocations.push({ method: 'export.start', request })
        return { ok: true }
      },
      direct: {
        async start(request) {
          invocations.push({ method: 'export.direct.start', request })
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
          invocations.push({ method: 'export.run.start', request })
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

test('guardCapabilityAccess exposes current clip/import.run/export surfaces and removes stale ai/import legacy methods', async () => {
  const guardCapabilityAccess = await loadGuardCapabilityAccess()
  const invocations = []
  const presto = createPrestoFixture(invocations)
  const manifest = {
    pluginId: 'plugin.guard.surface',
    requiredCapabilities: ['clip.selectAllOnTrack', 'import.run.start', 'export.mixWithSource', 'export.run.start', 'jobs.create', 'jobs.update'],
  }

  const guarded = guardCapabilityAccess(presto, manifest)

  assert.equal('ai' in guarded, false)
  assert.equal('preflight' in guarded.import, false)
  assert.equal('analyze' in guarded.import, false)
  assert.equal('finalize' in guarded.import, false)

  await guarded.clip.selectAllOnTrack({ trackName: 'Vox' })
  await guarded.import.run.start({ folderPaths: ['/tmp/import'] })
  await guarded.export.mixSource.list({ sourceType: 'output' })
  await guarded.export.run.start({ snapshotIds: ['snapshot-1'], exportSettings: { output_path: '/tmp/out' } })
  await guarded.jobs.create({ capability: 'jobs.get', targetDaw: 'pro_tools' })
  await guarded.jobs.update({ jobId: 'job-1', state: 'running' })

  assert.deepEqual(invocations, [
    { method: 'clip.selectAllOnTrack', request: { trackName: 'Vox' } },
    { method: 'import.run.start', request: { folderPaths: ['/tmp/import'] } },
    { method: 'export.mixSource.list', request: { sourceType: 'output' } },
    { method: 'export.run.start', request: { snapshotIds: ['snapshot-1'], exportSettings: { output_path: '/tmp/out' } } },
    { method: 'jobs.create', request: { capability: 'jobs.get', targetDaw: 'pro_tools' } },
    { method: 'jobs.update', request: { jobId: 'job-1', state: 'running' } },
  ])
})

test('guardCapabilityAccess still denies undeclared current capabilities', async () => {
  const guardCapabilityAccess = await loadGuardCapabilityAccess()
  const presto = createPrestoFixture([])
  const manifest = {
    pluginId: 'plugin.guard.denied',
    requiredCapabilities: ['import.run.start'],
  }

  const guarded = guardCapabilityAccess(presto, manifest)
  await assert.rejects(
    async () => guarded.clip.selectAllOnTrack({ trackName: 'Kick' }),
    (error) =>
      error instanceof Error &&
      error.name === 'PluginPermissionError' &&
      error.code === 'PLUGIN_PERMISSION_DENIED' &&
      String(error.message).includes('clip.selectAllOnTrack()'),
  )
})
