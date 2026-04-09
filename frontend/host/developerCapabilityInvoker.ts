import type { PrestoClient } from '@presto/contracts'

import type { DeveloperCapabilityId } from './developerCapabilityInventory'

type CoreIoPublicClient = {
  import: {
    run: {
      start(payload: unknown): Promise<unknown>
    }
  }
  export: {
    range: {
      set(payload: unknown): Promise<unknown>
    }
    start(payload: unknown): Promise<unknown>
    direct: {
      start(payload: unknown): Promise<unknown>
    }
  }
}

type ManualJobsPublicClient = {
  create(payload: unknown): Promise<unknown>
  update(payload: unknown): Promise<unknown>
}

export async function invokePublicCapability(
  presto: PrestoClient,
  capabilityId: DeveloperCapabilityId,
  payload: unknown,
): Promise<unknown> {
  switch (capabilityId) {
    case 'system.health':
      return presto.system.health()
    case 'config.get':
      return presto.config.get()
    case 'config.update':
      return presto.config.update(payload as never)
    case 'daw.connection.connect':
      return presto.daw.connection.connect(payload as never)
    case 'daw.connection.disconnect':
      return presto.daw.connection.disconnect()
    case 'daw.connection.getStatus':
      return presto.daw.connection.getStatus()
    case 'session.getInfo':
      return presto.session.getInfo()
    case 'session.getLength':
      return presto.session.getLength()
    case 'session.save':
      return presto.session.save()
    case 'session.applySnapshot':
      return presto.session.applySnapshot(payload as never)
    case 'session.getSnapshotInfo':
      return presto.session.getSnapshotInfo(payload as never)
    case 'track.list':
      return presto.track.list()
    case 'track.listNames':
      return presto.track.listNames()
    case 'track.selection.get':
      return presto.track.selection.get()
    case 'track.rename':
      return presto.track.rename(payload as never)
    case 'track.select':
      return presto.track.select(payload as never)
    case 'track.color.apply':
      return presto.track.color.apply(payload as never)
    case 'track.hidden.set':
      return presto.track.hidden.set(payload as never)
    case 'track.inactive.set':
      return presto.track.inactive.set(payload as never)
    case 'track.mute.set':
      return presto.track.mute.set(payload as never)
    case 'track.solo.set':
      return presto.track.solo.set(payload as never)
    case 'track.recordEnable.set':
      return presto.track.recordEnable.set(payload as never)
    case 'track.recordSafe.set':
      return presto.track.recordSafe.set(payload as never)
    case 'track.inputMonitor.set':
      return presto.track.inputMonitor.set(payload as never)
    case 'track.online.set':
      return presto.track.online.set(payload as never)
    case 'track.frozen.set':
      return presto.track.frozen.set(payload as never)
    case 'track.open.set':
      return presto.track.open.set(payload as never)
    case 'clip.selectAllOnTrack':
      return presto.clip.selectAllOnTrack(payload as never)
    case 'transport.play':
      return presto.transport.play()
    case 'transport.stop':
      return presto.transport.stop()
    case 'transport.record':
      return presto.transport.record()
    case 'transport.getStatus':
      return presto.transport.getStatus()
    case 'stripSilence.open':
      return presto.stripSilence.open()
    case 'stripSilence.execute':
      return presto.stripSilence.execute(payload as never)
    case 'jobs.get':
      return presto.jobs.get((payload as { jobId: string }).jobId)
    case 'jobs.list':
      return presto.jobs.list(payload as never)
    case 'jobs.create': {
      const method = (presto.jobs as Partial<ManualJobsPublicClient>).create
      if (typeof method !== 'function') {
        throw {
          code: 'JOBS_PUBLIC_CLIENT_UNAVAILABLE',
          capability: capabilityId,
          message: 'presto.jobs.create is unavailable on the current public client.',
        }
      }
      return method(payload)
    }
    case 'jobs.update': {
      const method = (presto.jobs as Partial<ManualJobsPublicClient>).update
      if (typeof method !== 'function') {
        throw {
          code: 'JOBS_PUBLIC_CLIENT_UNAVAILABLE',
          capability: capabilityId,
          message: 'presto.jobs.update is unavailable on the current public client.',
        }
      }
      return method(payload)
    }
    case 'jobs.cancel':
      return presto.jobs.cancel((payload as { jobId: string }).jobId)
    case 'jobs.delete':
      return presto.jobs.delete((payload as { jobId: string }).jobId)
    case 'import.run.start': {
      const method = (presto as Partial<CoreIoPublicClient>).import?.run?.start
      if (typeof method !== 'function') {
        throw {
          code: 'CORE_IO_PUBLIC_CLIENT_UNAVAILABLE',
          capability: capabilityId,
          message: 'presto.import.run.start is unavailable on the current public client.',
        }
      }
      return method(payload)
    }
    case 'export.range.set': {
      const method = (presto as Partial<CoreIoPublicClient>).export?.range?.set
      if (typeof method !== 'function') {
        throw {
          code: 'CORE_IO_PUBLIC_CLIENT_UNAVAILABLE',
          capability: capabilityId,
          message: 'presto.export.range.set is unavailable on the current public client.',
        }
      }
      return method(payload)
    }
    case 'export.start': {
      const method = (presto as Partial<CoreIoPublicClient>).export?.start
      if (typeof method !== 'function') {
        throw {
          code: 'CORE_IO_PUBLIC_CLIENT_UNAVAILABLE',
          capability: capabilityId,
          message: 'presto.export.start is unavailable on the current public client.',
        }
      }
      return method(payload)
    }
    case 'export.direct.start': {
      const method = (presto as Partial<CoreIoPublicClient>).export?.direct?.start
      if (typeof method !== 'function') {
        throw {
          code: 'CORE_IO_PUBLIC_CLIENT_UNAVAILABLE',
          capability: capabilityId,
          message: 'presto.export.direct.start is unavailable on the current public client.',
        }
      }
      return method(payload)
    }
    default:
      throw new Error(`unsupported_capability:${capabilityId}`)
  }
}
