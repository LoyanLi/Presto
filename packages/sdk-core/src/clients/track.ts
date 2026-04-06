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
    invokeCapability<TrackListRequest, TrackListResponse>(context, 'track.list', {}),
  listNames: () =>
    invokeCapability<TrackListNamesRequest, TrackListNamesResponse>(
      context,
      'track.listNames',
      {},
    ),
  selection: {
    get: () =>
      invokeCapability<TrackSelectionGetRequest, TrackSelectionGetResponse>(
        context,
        'track.selection.get',
        {},
      ),
  },
  rename: (request: TrackRenameRequest) =>
    invokeCapability<TrackRenameRequest, TrackRenameResponse>(context, 'track.rename', request),
  select: (request: TrackSelectRequest) =>
    invokeCapability<TrackSelectRequest, TrackSelectResponse>(context, 'track.select', request),
  color: {
    apply: (request: TrackColorApplyRequest) =>
      invokeCapability<TrackColorApplyRequest, TrackColorApplyResponse>(
        context,
        'track.color.apply',
        request,
      ),
  },
  pan: {
    set: (request: TrackPanSetRequest) =>
      invokeCapability<TrackPanSetRequest, TrackPanSetResponse>(context, 'track.pan.set', request),
  },
  mute: {
    set: (request: TrackMuteSetRequest) =>
      invokeCapability<TrackMuteSetRequest, TrackMuteSetResponse>(context, 'track.mute.set', request),
  },
  solo: {
    set: (request: TrackSoloSetRequest) =>
      invokeCapability<TrackSoloSetRequest, TrackSoloSetResponse>(context, 'track.solo.set', request),
  },
  hidden: {
    set: (request: TrackHiddenSetRequest) =>
      invokeCapability<TrackHiddenSetRequest, TrackHiddenSetResponse>(context, 'track.hidden.set', request),
  },
  inactive: {
    set: (request: TrackInactiveSetRequest) =>
      invokeCapability<TrackInactiveSetRequest, TrackInactiveSetResponse>(context, 'track.inactive.set', request),
  },
  recordEnable: {
    set: (request: TrackRecordEnableSetRequest) =>
      invokeCapability<TrackRecordEnableSetRequest, TrackRecordEnableSetResponse>(context, 'track.recordEnable.set', request),
  },
  recordSafe: {
    set: (request: TrackRecordSafeSetRequest) =>
      invokeCapability<TrackRecordSafeSetRequest, TrackRecordSafeSetResponse>(context, 'track.recordSafe.set', request),
  },
  inputMonitor: {
    set: (request: TrackInputMonitorSetRequest) =>
      invokeCapability<TrackInputMonitorSetRequest, TrackInputMonitorSetResponse>(context, 'track.inputMonitor.set', request),
  },
  online: {
    set: (request: TrackOnlineSetRequest) =>
      invokeCapability<TrackOnlineSetRequest, TrackOnlineSetResponse>(context, 'track.online.set', request),
  },
  frozen: {
    set: (request: TrackFrozenSetRequest) =>
      invokeCapability<TrackFrozenSetRequest, TrackFrozenSetResponse>(context, 'track.frozen.set', request),
  },
  open: {
    set: (request: TrackOpenSetRequest) =>
      invokeCapability<TrackOpenSetRequest, TrackOpenSetResponse>(context, 'track.open.set', request),
  },
})
