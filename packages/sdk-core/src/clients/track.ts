import type {
  PublicCapabilityId,
  TrackClient,
  TrackColorApplyRequest,
  TrackColorApplyResponse,
  TrackListNamesRequest,
  TrackListNamesResponse,
  TrackListRequest,
  TrackListResponse,
  TrackSelectionGetRequest,
  TrackSelectionGetResponse,
  TrackHiddenSetRequest,
  TrackHiddenSetResponse,
  TrackInputMonitorSetRequest,
  TrackInputMonitorSetResponse,
  TrackInactiveSetRequest,
  TrackInactiveSetResponse,
  TrackMuteSetRequest,
  TrackMuteSetResponse,
  TrackOnlineSetRequest,
  TrackOnlineSetResponse,
  TrackPanSetRequest,
  TrackPanSetResponse,
  TrackRecordEnableSetRequest,
  TrackRecordEnableSetResponse,
  TrackRecordSafeSetRequest,
  TrackRecordSafeSetResponse,
  TrackRenameRequest,
  TrackRenameResponse,
  TrackSelectRequest,
  TrackSelectResponse,
  TrackSoloSetRequest,
  TrackSoloSetResponse,
  TrackFrozenSetRequest,
  TrackFrozenSetResponse,
  TrackOpenSetRequest,
  TrackOpenSetResponse,
} from '@presto/contracts'
import type { PrestoClientAssemblyContext } from '../createPrestoClient'

const invokeCapability = async <TRequest, TResponse>(
  context: PrestoClientAssemblyContext,
  capability: PublicCapabilityId,
  payload: TRequest,
): Promise<TResponse> => {
  const response = await context.transport.invoke<TRequest, TResponse>({
    requestId: context.nextRequestId(),
    capability,
    payload,
    meta: {
      clientName: context.clientName,
      clientVersion: context.clientVersion,
    },
  })

  if (response.success === false) {
    throw response.error
  }

  return response.data
}

export const createTrackClient = (context: PrestoClientAssemblyContext): TrackClient => ({
  list: () =>
    invokeCapability<TrackListRequest, TrackListResponse>(context, 'daw.track.list', {}),
  listNames: () =>
    invokeCapability<TrackListNamesRequest, TrackListNamesResponse>(
      context,
      'daw.track.listNames',
      {},
    ),
  selection: {
    get: () =>
      invokeCapability<TrackSelectionGetRequest, TrackSelectionGetResponse>(
        context,
        'daw.track.selection.get',
        {},
      ),
  },
  rename: (request: TrackRenameRequest) =>
    invokeCapability<TrackRenameRequest, TrackRenameResponse>(context, 'daw.track.rename', request),
  select: (request: TrackSelectRequest) =>
    invokeCapability<TrackSelectRequest, TrackSelectResponse>(context, 'daw.track.select', request),
  color: {
    apply: (request: TrackColorApplyRequest) =>
      invokeCapability<TrackColorApplyRequest, TrackColorApplyResponse>(
        context,
        'daw.track.color.apply',
        request,
      ),
  },
  pan: {
    set: (request: TrackPanSetRequest) =>
      invokeCapability<TrackPanSetRequest, TrackPanSetResponse>(context, 'daw.track.pan.set', request),
  },
  mute: {
    set: (request: TrackMuteSetRequest) =>
      invokeCapability<TrackMuteSetRequest, TrackMuteSetResponse>(context, 'daw.track.mute.set', request),
  },
  solo: {
    set: (request: TrackSoloSetRequest) =>
      invokeCapability<TrackSoloSetRequest, TrackSoloSetResponse>(context, 'daw.track.solo.set', request),
  },
  hidden: {
    set: (request: TrackHiddenSetRequest) =>
      invokeCapability<TrackHiddenSetRequest, TrackHiddenSetResponse>(context, 'daw.track.hidden.set', request),
  },
  inactive: {
    set: (request: TrackInactiveSetRequest) =>
      invokeCapability<TrackInactiveSetRequest, TrackInactiveSetResponse>(context, 'daw.track.inactive.set', request),
  },
  recordEnable: {
    set: (request: TrackRecordEnableSetRequest) =>
      invokeCapability<TrackRecordEnableSetRequest, TrackRecordEnableSetResponse>(context, 'daw.track.recordEnable.set', request),
  },
  recordSafe: {
    set: (request: TrackRecordSafeSetRequest) =>
      invokeCapability<TrackRecordSafeSetRequest, TrackRecordSafeSetResponse>(context, 'daw.track.recordSafe.set', request),
  },
  inputMonitor: {
    set: (request: TrackInputMonitorSetRequest) =>
      invokeCapability<TrackInputMonitorSetRequest, TrackInputMonitorSetResponse>(context, 'daw.track.inputMonitor.set', request),
  },
  online: {
    set: (request: TrackOnlineSetRequest) =>
      invokeCapability<TrackOnlineSetRequest, TrackOnlineSetResponse>(context, 'daw.track.online.set', request),
  },
  frozen: {
    set: (request: TrackFrozenSetRequest) =>
      invokeCapability<TrackFrozenSetRequest, TrackFrozenSetResponse>(context, 'daw.track.frozen.set', request),
  },
  open: {
    set: (request: TrackOpenSetRequest) =>
      invokeCapability<TrackOpenSetRequest, TrackOpenSetResponse>(context, 'daw.track.open.set', request),
  },
})
