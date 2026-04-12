import type { PrestoClient } from '@presto/contracts/capabilities/clients'
import type { WorkflowPluginManifest } from '@presto/contracts/plugins/manifest'

class PluginPermissionError extends Error {
  readonly code = 'PLUGIN_PERMISSION_DENIED'
  readonly pluginId: string
  readonly resource: string

  constructor(pluginId: string, resource: string, message: string) {
    super(message)
    this.name = 'PluginPermissionError'
    this.pluginId = pluginId
    this.resource = resource
  }
}

type ManifestPermissionShape = Pick<WorkflowPluginManifest, 'pluginId' | 'requiredCapabilities'> & {
  displayName?: string
}

export interface PluginRunMetricsRecorder {
  recordCommandSuccess?(capabilityId: string): void
  recordWorkflowJobSuccess?(input: {
    jobId: string
    workflowId: string
    pluginId: string
    label?: string
    commandCounts: Record<string, number>
    at?: string
  }): void
  recordToolRunSuccess?(input: {
    jobId: string
    toolKey: string
    label?: string
    at?: string
  }): void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeCommandCounts(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([capabilityId, count]) =>
      Number.isFinite(count) && Math.trunc(count) > 0 ? [[capabilityId, Math.trunc(count)]] : [],
    ),
  )
}

function getWorkflowJobMetrics(
  value: unknown,
  fallbackPluginId: string,
  label?: string,
):
  | {
      jobId: string
      workflowId: string
      pluginId: string
      label?: string
      commandCounts: Record<string, number>
      at?: string
    }
  | null {
  if (!isRecord(value) || value.capability !== 'workflow.run.start' || value.state !== 'succeeded') {
    return null
  }

  const jobId = typeof value.jobId === 'string' ? value.jobId.trim() : ''
  if (jobId.length === 0) {
    return null
  }

  const metadata = isRecord(value.metadata) ? value.metadata : null
  const result = isRecord(value.result) ? value.result : null
  const metrics = result && isRecord(result.metrics) ? result.metrics : null
  const workflowIdCandidate =
    (metrics && typeof metrics.workflowId === 'string' ? metrics.workflowId : undefined) ??
    (metadata && typeof metadata.workflowId === 'string' ? metadata.workflowId : undefined) ??
    (result && typeof result.workflowId === 'string' ? result.workflowId : undefined) ??
    ''
  const workflowId = workflowIdCandidate.trim()
  if (workflowId.length === 0) {
    return null
  }

  const pluginIdCandidate = metadata && typeof metadata.pluginId === 'string' ? metadata.pluginId : fallbackPluginId

  return {
    jobId,
    workflowId,
    pluginId: pluginIdCandidate.trim() || fallbackPluginId,
    ...(label ? { label } : {}),
    commandCounts: normalizeCommandCounts(metrics?.commandCounts),
    ...(typeof value.finishedAt === 'string' && value.finishedAt.trim().length > 0 ? { at: value.finishedAt } : {}),
  }
}

function getToolJobMetrics(
  value: unknown,
  fallbackPluginId: string,
):
  | {
      jobId: string
      toolKey: string
      label?: string
      at?: string
    }
  | null {
  if (!isRecord(value) || value.capability !== 'tool.run' || value.state !== 'succeeded') {
    return null
  }

  const jobId = typeof value.jobId === 'string' ? value.jobId.trim() : ''
  if (jobId.length === 0) {
    return null
  }

  const metadata = isRecord(value.metadata) ? value.metadata : null
  const result = isRecord(value.result) ? value.result : null
  const metrics = result && isRecord(result.metrics) ? result.metrics : null
  const toolIdCandidate =
    (metrics && typeof metrics.toolId === 'string' ? metrics.toolId : undefined) ??
    (metadata && typeof metadata.toolId === 'string' ? metadata.toolId : undefined) ??
    (result && typeof result.toolId === 'string' ? result.toolId : undefined) ??
    ''
  const toolId = toolIdCandidate.trim()
  if (toolId.length === 0) {
    return null
  }

  const pluginIdCandidate = metadata && typeof metadata.pluginId === 'string' ? metadata.pluginId : fallbackPluginId
  const pluginId = pluginIdCandidate.trim() || fallbackPluginId
  const labelCandidate =
    (metrics && typeof metrics.toolLabel === 'string' ? metrics.toolLabel : undefined) ??
    (metadata && typeof metadata.toolTitle === 'string' ? metadata.toolTitle : undefined) ??
    (metadata && typeof metadata.toolLabel === 'string' ? metadata.toolLabel : undefined) ??
    (result && typeof result.toolTitle === 'string' ? result.toolTitle : undefined) ??
    (result && typeof result.toolLabel === 'string' ? result.toolLabel : undefined)
  const label = typeof labelCandidate === 'string' && labelCandidate.trim().length > 0 ? labelCandidate : undefined

  return {
    jobId,
    toolKey: `${pluginId}:${toolId}`,
    ...(label ? { label } : {}),
    ...(typeof value.finishedAt === 'string' && value.finishedAt.trim().length > 0 ? { at: value.finishedAt } : {}),
  }
}

function shouldRecordCommand(capabilityId: string): boolean {
  return !capabilityId.startsWith('jobs.')
}

function createPermissionError(pluginId: string, resource: string, action: string): PluginPermissionError {
  return new PluginPermissionError(
    pluginId,
    resource,
    `Plugin "${pluginId}" is not allowed to access ${action}.`,
  )
}

function createCapabilityGuard<Args extends unknown[], Result>(
  allowedCapabilities: ReadonlySet<string>,
  pluginId: string,
  capabilityId: string,
  action: string,
  invoke: (...args: Args) => Promise<Result>,
  pluginDisplayName?: string,
  metricsRecorder?: PluginRunMetricsRecorder,
): (...args: Args) => Promise<Result> {
  return async (...args: Args) => {
    if (!allowedCapabilities.has(capabilityId)) {
      throw createPermissionError(pluginId, capabilityId, action)
    }

    const result = await invoke(...args)

    if (shouldRecordCommand(capabilityId)) {
      metricsRecorder?.recordCommandSuccess?.(capabilityId)
    }

    if (capabilityId === 'jobs.get') {
      const workflowJobMetrics = getWorkflowJobMetrics(result, pluginId, pluginDisplayName)
      if (workflowJobMetrics) {
        metricsRecorder?.recordWorkflowJobSuccess?.(workflowJobMetrics)
      }

      const toolJobMetrics = getToolJobMetrics(result, pluginId)
      if (toolJobMetrics) {
        metricsRecorder?.recordToolRunSuccess?.(toolJobMetrics)
      }
    }

    return result
  }
}

function requireService<T>(service: T | undefined | null, pluginId: string, serviceName: string): T {
  if (service === undefined || service === null) {
    throw new PluginPermissionError(
      pluginId,
      serviceName,
      `Plugin "${pluginId}" requires ${serviceName}, but the host did not provide it.`,
    )
  }

  return service
}

export function guardCapabilityAccess(
  presto: PrestoClient,
  manifest: ManifestPermissionShape,
  metricsRecorder?: PluginRunMetricsRecorder,
): PrestoClient {
  const allowedCapabilities = new Set<string>(manifest.requiredCapabilities)
  const pluginId = manifest.pluginId

  const system = () => requireService(presto.system, pluginId, 'presto.system')
  const config = () => requireService(presto.config, pluginId, 'presto.config')
  const daw = () => requireService(presto.daw, pluginId, 'presto.daw')
  const automation = () => requireService(presto.automation, pluginId, 'presto.automation')
  const session = () => requireService(presto.session, pluginId, 'presto.session')
  const track = () => requireService(presto.track, pluginId, 'presto.track')
  const clip = () => requireService(presto.clip, pluginId, 'presto.clip')
  const transport = () => requireService(presto.transport, pluginId, 'presto.transport')
  const workflow = () => requireService(presto.workflow, pluginId, 'presto.workflow')
  const importClient = () => requireService(presto.import, pluginId, 'presto.import')
  const stripSilence = () => requireService(presto.stripSilence, pluginId, 'presto.stripSilence')
  const exportClient = () => requireService(presto.export, pluginId, 'presto.export')
  const jobs = () => requireService(presto.jobs, pluginId, 'presto.jobs')
  const guard = <Args extends unknown[], Result>(
    capabilityId: string,
    action: string,
    invoke: (...args: Args) => Promise<Result>,
  ): ((...args: Args) => Promise<Result>) =>
    createCapabilityGuard(
      allowedCapabilities,
      pluginId,
      capabilityId,
      action,
      invoke,
      manifest.displayName,
      metricsRecorder,
    )

  return {
    automation: {
      splitStereoToMono: {
        execute: guard(
                    'daw.automation.splitStereoToMono.execute',
          'daw.automation.splitStereoToMono.execute()',
          (request) => automation().splitStereoToMono.execute(request),
        ),
      },
    },
    system: {
      health: guard(
                  'system.health',
        'system.health()',
        () => system().health(),
      ),
    },
    config: {
      get: guard(
                  'config.get',
        'config.get()',
        () => config().get(),
      ),
      update: guard(
                  'config.update',
        'config.update()',
        (request) => config().update(request),
      ),
    },
    daw: {
      adapter: {
        getSnapshot: guard(
                    'daw.adapter.getSnapshot',
          'daw.adapter.getSnapshot()',
          () => daw().adapter.getSnapshot(),
        ),
      },
      connection: {
        connect: guard(
                    'daw.connection.connect',
          'daw.connection.connect()',
          (request) => daw().connection.connect(request),
        ),
        disconnect: guard(
                    'daw.connection.disconnect',
          'daw.connection.disconnect()',
          () => daw().connection.disconnect(),
        ),
        getStatus: guard(
                    'daw.connection.getStatus',
          'daw.connection.getStatus()',
          () => daw().connection.getStatus(),
        ),
      },
    },
    session: {
      getInfo: guard(
                  'daw.session.getInfo',
        'daw.session.getInfo()',
        () => session().getInfo(),
      ),
      getLength: guard(
                  'daw.session.getLength',
        'daw.session.getLength()',
        () => session().getLength(),
      ),
      save: guard(
                  'daw.session.save',
        'daw.session.save()',
        () => session().save(),
      ),
      applySnapshot: guard(
                  'daw.session.applySnapshot',
        'daw.session.applySnapshot()',
        (request) => session().applySnapshot(request),
      ),
      getSnapshotInfo: guard(
                  'daw.session.getSnapshotInfo',
        'daw.session.getSnapshotInfo()',
        (request) => session().getSnapshotInfo(request),
      ),
    },
    track: {
      list: guard(
                  'daw.track.list',
        'daw.track.list()',
        () => track().list(),
      ),
      listNames: guard(
                  'daw.track.listNames',
        'daw.track.listNames()',
        () => track().listNames(),
      ),
      selection: {
        get: guard(
                    'daw.track.selection.get',
          'daw.track.selection.get()',
          () => track().selection.get(),
        ),
      },
      rename: guard(
                  'daw.track.rename',
        'daw.track.rename()',
        (request) => track().rename(request),
      ),
      select: guard(
                  'daw.track.select',
        'daw.track.select()',
        (request) => track().select(request),
      ),
      color: {
        apply: guard(
                    'daw.track.color.apply',
          'daw.track.color.apply()',
          (request) => track().color.apply(request),
        ),
      },
      pan: {
        set: guard(
                    'daw.track.pan.set',
          'daw.track.pan.set()',
          (request) => track().pan.set(request),
        ),
      },
      mute: {
        set: guard(
                    'daw.track.mute.set',
          'daw.track.mute.set()',
          (request) => track().mute.set(request),
        ),
      },
      solo: {
        set: guard(
                    'daw.track.solo.set',
          'daw.track.solo.set()',
          (request) => track().solo.set(request),
        ),
      },
      hidden: {
        set: guard(
                    'daw.track.hidden.set',
          'daw.track.hidden.set()',
          (request) => track().hidden.set(request),
        ),
      },
      inactive: {
        set: guard(
                    'daw.track.inactive.set',
          'daw.track.inactive.set()',
          (request) => track().inactive.set(request),
        ),
      },
    },
    clip: {
      selectAllOnTrack: guard(
                  'daw.clip.selectAllOnTrack',
        'daw.clip.selectAllOnTrack()',
        (request) => clip().selectAllOnTrack(request),
      ),
    },
    transport: {
      play: guard(
                  'daw.transport.play',
        'daw.transport.play()',
        () => transport().play(),
      ),
      stop: guard(
                  'daw.transport.stop',
        'daw.transport.stop()',
        () => transport().stop(),
      ),
      record: guard(
                  'daw.transport.record',
        'daw.transport.record()',
        () => transport().record(),
      ),
      getStatus: guard(
                  'daw.transport.getStatus',
        'daw.transport.getStatus()',
        () => transport().getStatus(),
      ),
    },
    workflow: {
      run: {
        start: guard(
                    'workflow.run.start',
          'workflow.run.start()',
          (request) => workflow().run.start(request),
        ),
      },
    },
    import: {
      analyze: guard(
                  'daw.import.analyze',
        'daw.import.analyze()',
        (request) => importClient().analyze(request),
      ),
      cache: {
        save: guard(
                    'daw.import.cache.save',
          'daw.import.cache.save()',
          (request) => importClient().cache.save(request),
        ),
      },
      run: {
        start: guard(
                    'daw.import.run.start',
          'daw.import.run.start()',
          (request) => importClient().run.start(request),
        ),
      },
    },
    stripSilence: {
      open: guard(
                  'daw.stripSilence.open',
        'daw.stripSilence.open()',
        () => stripSilence().open(),
      ),
      execute: guard(
                  'daw.stripSilence.execute',
        'daw.stripSilence.execute()',
        (request) => stripSilence().execute(request),
      ),
    },
    export: {
      range: {
        set: guard(
                    'daw.export.range.set',
          'daw.export.range.set()',
          (request) => exportClient().range.set(request),
        ),
      },
      start: guard(
                  'daw.export.start',
        'daw.export.start()',
        (request) => exportClient().start(request),
      ),
      direct: {
        start: guard(
                    'daw.export.direct.start',
          'daw.export.direct.start()',
          (request) => exportClient().direct.start(request),
        ),
      },
      mixSource: {
        list: guard(
                    'daw.export.mixWithSource',
          'export.mixSource.list()',
          (request) => exportClient().mixSource.list(request),
        ),
      },
      run: {
        start: guard(
                    'daw.export.run.start',
          'daw.export.run.start()',
          (request) => exportClient().run.start(request),
        ),
      },
    },
    jobs: {
      create: guard(
                  'jobs.create',
        'jobs.create()',
        (request) => jobs().create(request),
      ),
      update: guard(
                  'jobs.update',
        'jobs.update()',
        (request) => jobs().update(request),
      ),
      get: guard(
                  'jobs.get',
        'jobs.get()',
        (jobId) => jobs().get(jobId),
      ),
      list: guard(
                  'jobs.list',
        'jobs.list()',
        (filter) => jobs().list(filter),
      ),
      cancel: guard(
                  'jobs.cancel',
        'jobs.cancel()',
        (jobId) => jobs().cancel(jobId),
      ),
      delete: guard(
                  'jobs.delete',
        'jobs.delete()',
        (jobId) => jobs().delete(jobId),
      ),
    },
  }
}
