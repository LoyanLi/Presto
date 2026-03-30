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
  TrackMuteSetRequest,
  TrackMuteSetResponse,
  TrackPanSetRequest,
  TrackPanSetResponse,
  TrackRenameRequest,
  TrackRenameResponse,
  TrackSelectRequest,
  TrackSelectResponse,
  TrackSoloSetRequest,
  TrackSoloSetResponse,
} from '../../../contracts/src'
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
})
