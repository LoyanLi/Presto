import type {
  PublicCapabilityId,
  SessionApplySnapshotRequest,
  SessionApplySnapshotResponse,
  SessionClient,
  SessionGetInfoRequest,
  SessionGetInfoResponse,
  SessionGetLengthRequest,
  SessionGetLengthResponse,
  SessionGetSnapshotInfoRequest,
  SessionGetSnapshotInfoResponse,
  SessionSaveRequest,
  SessionSaveResponse,
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

export const createSessionClient = (context: PrestoClientAssemblyContext): SessionClient => ({
  getInfo: () =>
    invokeCapability<SessionGetInfoRequest, SessionGetInfoResponse>(context, 'session.getInfo', {}),
  getLength: () =>
    invokeCapability<SessionGetLengthRequest, SessionGetLengthResponse>(
      context,
      'session.getLength',
      {},
    ),
  save: () => invokeCapability<SessionSaveRequest, SessionSaveResponse>(context, 'session.save', {}),
  applySnapshot: (request: SessionApplySnapshotRequest) =>
    invokeCapability<SessionApplySnapshotRequest, SessionApplySnapshotResponse>(
      context,
      'session.applySnapshot',
      request,
    ),
  getSnapshotInfo: (request: SessionGetSnapshotInfoRequest) =>
    invokeCapability<SessionGetSnapshotInfoRequest, SessionGetSnapshotInfoResponse>(
      context,
      'session.getSnapshotInfo',
      request,
    ),
})
