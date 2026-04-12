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

type ManifestPermissionShape = Pick<WorkflowPluginManifest, 'pluginId' | 'requiredCapabilities'>

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
): (...args: Args) => Promise<Result> {
  return async (...args: Args) => {
    if (!allowedCapabilities.has(capabilityId)) {
      throw createPermissionError(pluginId, capabilityId, action)
    }

    return invoke(...args)
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

export function guardCapabilityAccess(presto: PrestoClient, manifest: ManifestPermissionShape): PrestoClient {
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

  return {
    automation: {
      splitStereoToMono: {
        execute: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.automation.splitStereoToMono.execute',
          'daw.automation.splitStereoToMono.execute()',
          (request) => automation().splitStereoToMono.execute(request),
        ),
      },
    },
    system: {
      health: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'system.health',
        'system.health()',
        () => system().health(),
      ),
    },
    config: {
      get: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'config.get',
        'config.get()',
        () => config().get(),
      ),
      update: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'config.update',
        'config.update()',
        (request) => config().update(request),
      ),
    },
    daw: {
      adapter: {
        getSnapshot: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.adapter.getSnapshot',
          'daw.adapter.getSnapshot()',
          () => daw().adapter.getSnapshot(),
        ),
      },
      connection: {
        connect: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.connection.connect',
          'daw.connection.connect()',
          (request) => daw().connection.connect(request),
        ),
        disconnect: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.connection.disconnect',
          'daw.connection.disconnect()',
          () => daw().connection.disconnect(),
        ),
        getStatus: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.connection.getStatus',
          'daw.connection.getStatus()',
          () => daw().connection.getStatus(),
        ),
      },
    },
    session: {
      getInfo: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.session.getInfo',
        'daw.session.getInfo()',
        () => session().getInfo(),
      ),
      getLength: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.session.getLength',
        'daw.session.getLength()',
        () => session().getLength(),
      ),
      save: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.session.save',
        'daw.session.save()',
        () => session().save(),
      ),
      applySnapshot: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.session.applySnapshot',
        'daw.session.applySnapshot()',
        (request) => session().applySnapshot(request),
      ),
      getSnapshotInfo: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.session.getSnapshotInfo',
        'daw.session.getSnapshotInfo()',
        (request) => session().getSnapshotInfo(request),
      ),
    },
    track: {
      list: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.track.list',
        'daw.track.list()',
        () => track().list(),
      ),
      listNames: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.track.listNames',
        'daw.track.listNames()',
        () => track().listNames(),
      ),
      selection: {
        get: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.track.selection.get',
          'daw.track.selection.get()',
          () => track().selection.get(),
        ),
      },
      rename: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.track.rename',
        'daw.track.rename()',
        (request) => track().rename(request),
      ),
      select: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.track.select',
        'daw.track.select()',
        (request) => track().select(request),
      ),
      color: {
        apply: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.track.color.apply',
          'daw.track.color.apply()',
          (request) => track().color.apply(request),
        ),
      },
      pan: {
        set: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.track.pan.set',
          'daw.track.pan.set()',
          (request) => track().pan.set(request),
        ),
      },
      mute: {
        set: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.track.mute.set',
          'daw.track.mute.set()',
          (request) => track().mute.set(request),
        ),
      },
      solo: {
        set: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.track.solo.set',
          'daw.track.solo.set()',
          (request) => track().solo.set(request),
        ),
      },
      hidden: {
        set: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.track.hidden.set',
          'daw.track.hidden.set()',
          (request) => track().hidden.set(request),
        ),
      },
      inactive: {
        set: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.track.inactive.set',
          'daw.track.inactive.set()',
          (request) => track().inactive.set(request),
        ),
      },
    },
    clip: {
      selectAllOnTrack: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.clip.selectAllOnTrack',
        'daw.clip.selectAllOnTrack()',
        (request) => clip().selectAllOnTrack(request),
      ),
    },
    transport: {
      play: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.transport.play',
        'daw.transport.play()',
        () => transport().play(),
      ),
      stop: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.transport.stop',
        'daw.transport.stop()',
        () => transport().stop(),
      ),
      record: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.transport.record',
        'daw.transport.record()',
        () => transport().record(),
      ),
      getStatus: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.transport.getStatus',
        'daw.transport.getStatus()',
        () => transport().getStatus(),
      ),
    },
    workflow: {
      run: {
        start: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'workflow.run.start',
          'workflow.run.start()',
          (request) => workflow().run.start(request),
        ),
      },
    },
    import: {
      analyze: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.import.analyze',
        'daw.import.analyze()',
        (request) => importClient().analyze(request),
      ),
      cache: {
        save: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.import.cache.save',
          'daw.import.cache.save()',
          (request) => importClient().cache.save(request),
        ),
      },
      run: {
        start: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.import.run.start',
          'daw.import.run.start()',
          (request) => importClient().run.start(request),
        ),
      },
    },
    stripSilence: {
      open: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.stripSilence.open',
        'daw.stripSilence.open()',
        () => stripSilence().open(),
      ),
      execute: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.stripSilence.execute',
        'daw.stripSilence.execute()',
        (request) => stripSilence().execute(request),
      ),
    },
    export: {
      range: {
        set: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.export.range.set',
          'daw.export.range.set()',
          (request) => exportClient().range.set(request),
        ),
      },
      start: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'daw.export.start',
        'daw.export.start()',
        (request) => exportClient().start(request),
      ),
      direct: {
        start: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.export.direct.start',
          'daw.export.direct.start()',
          (request) => exportClient().direct.start(request),
        ),
      },
      mixSource: {
        list: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.export.mixWithSource',
          'export.mixSource.list()',
          (request) => exportClient().mixSource.list(request),
        ),
      },
      run: {
        start: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.export.run.start',
          'daw.export.run.start()',
          (request) => exportClient().run.start(request),
        ),
      },
    },
    jobs: {
      create: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'jobs.create',
        'jobs.create()',
        (request) => jobs().create(request),
      ),
      update: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'jobs.update',
        'jobs.update()',
        (request) => jobs().update(request),
      ),
      get: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'jobs.get',
        'jobs.get()',
        (jobId) => jobs().get(jobId),
      ),
      list: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'jobs.list',
        'jobs.list()',
        (filter) => jobs().list(filter),
      ),
      cancel: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'jobs.cancel',
        'jobs.cancel()',
        (jobId) => jobs().cancel(jobId),
      ),
      delete: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'jobs.delete',
        'jobs.delete()',
        (jobId) => jobs().delete(jobId),
      ),
    },
  }
}
