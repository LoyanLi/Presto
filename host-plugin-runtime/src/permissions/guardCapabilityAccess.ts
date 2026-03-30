import type { PrestoClient } from '../../../packages/contracts/src/capabilities/clients'
import type { WorkflowPluginManifest } from '../../../packages/contracts/src/plugins/manifest'

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

function requireService<T>(service: T | undefined, pluginId: string, serviceName: string): T {
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

  const system = requireService(presto.system, pluginId, 'presto.system')
  const config = requireService(presto.config, pluginId, 'presto.config')
  const daw = requireService(presto.daw, pluginId, 'presto.daw')
  const session = requireService(presto.session, pluginId, 'presto.session')
  const track = requireService(presto.track, pluginId, 'presto.track')
  const clip = requireService(presto.clip, pluginId, 'presto.clip')
  const transport = requireService(presto.transport, pluginId, 'presto.transport')
  const importClient = requireService(presto.import, pluginId, 'presto.import')
  const stripSilence = requireService(presto.stripSilence, pluginId, 'presto.stripSilence')
  const exportClient = requireService(presto.export, pluginId, 'presto.export')
  const jobs = requireService(presto.jobs, pluginId, 'presto.jobs')

  return {
    system: {
      health: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'system.health',
        'system.health()',
        () => system.health(),
      ),
    },
    config: {
      get: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'config.get',
        'config.get()',
        () => config.get(),
      ),
      update: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'config.update',
        'config.update()',
        (request) => config.update(request),
      ),
    },
    daw: {
      connection: {
        connect: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.connection.connect',
          'daw.connection.connect()',
          (request) => daw.connection.connect(request),
        ),
        disconnect: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.connection.disconnect',
          'daw.connection.disconnect()',
          () => daw.connection.disconnect(),
        ),
        getStatus: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'daw.connection.getStatus',
          'daw.connection.getStatus()',
          () => daw.connection.getStatus(),
        ),
      },
    },
    session: {
      getInfo: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'session.getInfo',
        'session.getInfo()',
        () => session.getInfo(),
      ),
      getLength: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'session.getLength',
        'session.getLength()',
        () => session.getLength(),
      ),
      save: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'session.save',
        'session.save()',
        () => session.save(),
      ),
      applySnapshot: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'session.applySnapshot',
        'session.applySnapshot()',
        (request) => session.applySnapshot(request),
      ),
      getSnapshotInfo: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'session.getSnapshotInfo',
        'session.getSnapshotInfo()',
        (request) => session.getSnapshotInfo(request),
      ),
    },
    track: {
      list: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'track.list',
        'track.list()',
        () => track.list(),
      ),
      listNames: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'track.listNames',
        'track.listNames()',
        () => track.listNames(),
      ),
      rename: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'track.rename',
        'track.rename()',
        (request) => track.rename(request),
      ),
      select: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'track.select',
        'track.select()',
        (request) => track.select(request),
      ),
      color: {
        apply: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'track.color.apply',
          'track.color.apply()',
          (request) => track.color.apply(request),
        ),
      },
      mute: {
        set: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'track.mute.set',
          'track.mute.set()',
          (request) => track.mute.set(request),
        ),
      },
      solo: {
        set: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'track.solo.set',
          'track.solo.set()',
          (request) => track.solo.set(request),
        ),
      },
    },
    clip: {
      selectAllOnTrack: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'clip.selectAllOnTrack',
        'clip.selectAllOnTrack()',
        (request) => clip.selectAllOnTrack(request),
      ),
    },
    transport: {
      play: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'transport.play',
        'transport.play()',
        () => transport.play(),
      ),
      stop: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'transport.stop',
        'transport.stop()',
        () => transport.stop(),
      ),
      record: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'transport.record',
        'transport.record()',
        () => transport.record(),
      ),
      getStatus: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'transport.getStatus',
        'transport.getStatus()',
        () => transport.getStatus(),
      ),
    },
    import: {
      run: {
        start: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'import.run.start',
          'import.run.start()',
          (request) => importClient.run.start(request),
        ),
      },
    },
    stripSilence: {
      open: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'stripSilence.open',
        'stripSilence.open()',
        () => stripSilence.open(),
      ),
      execute: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'stripSilence.execute',
        'stripSilence.execute()',
        (request) => stripSilence.execute(request),
      ),
    },
    export: {
      range: {
        set: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'export.range.set',
          'export.range.set()',
          (request) => exportClient.range.set(request),
        ),
      },
      start: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'export.start',
        'export.start()',
        (request) => exportClient.start(request),
      ),
      direct: {
        start: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'export.direct.start',
          'export.direct.start()',
          (request) => exportClient.direct.start(request),
        ),
      },
      mixSource: {
        list: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'export.mixWithSource',
          'export.mixSource.list()',
          (request) => exportClient.mixSource.list(request),
        ),
      },
      run: {
        start: createCapabilityGuard(
          allowedCapabilities,
          pluginId,
          'export.run.start',
          'export.run.start()',
          (request) => exportClient.run.start(request),
        ),
      },
    },
    jobs: {
      create: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'jobs.create',
        'jobs.create()',
        (request) => jobs.create(request),
      ),
      update: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'jobs.update',
        'jobs.update()',
        (request) => jobs.update(request),
      ),
      get: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'jobs.get',
        'jobs.get()',
        (jobId) => jobs.get(jobId),
      ),
      list: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'jobs.list',
        'jobs.list()',
        (filter) => jobs.list(filter),
      ),
      cancel: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'jobs.cancel',
        'jobs.cancel()',
        (jobId) => jobs.cancel(jobId),
      ),
      delete: createCapabilityGuard(
        allowedCapabilities,
        pluginId,
        'jobs.delete',
        'jobs.delete()',
        (jobId) => jobs.delete(jobId),
      ),
    },
  }
}
