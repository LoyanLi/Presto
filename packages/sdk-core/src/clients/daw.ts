import type {
  DawAdapterGetSnapshotRequest,
  DawAdapterGetSnapshotResponse,
  DawClient,
  DawConnectionConnectRequest,
  DawConnectionConnectResponse,
  DawConnectionDisconnectRequest,
  DawConnectionDisconnectResponse,
  DawConnectionGetStatusRequest,
  DawConnectionGetStatusResponse,
  PublicCapabilityId,
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

export const createDawClient = (context: PrestoClientAssemblyContext): DawClient => ({
  adapter: {
    getSnapshot: () =>
      invokeCapability<DawAdapterGetSnapshotRequest, DawAdapterGetSnapshotResponse>(
        context,
        'daw.adapter.getSnapshot',
        {},
      ),
  },
  connection: {
    connect: (request: DawConnectionConnectRequest = {}) =>
      invokeCapability<DawConnectionConnectRequest, DawConnectionConnectResponse>(
        context,
        'daw.connection.connect',
        request,
      ),
    disconnect: () =>
      invokeCapability<DawConnectionDisconnectRequest, DawConnectionDisconnectResponse>(
        context,
        'daw.connection.disconnect',
        {},
      ),
    getStatus: () =>
      invokeCapability<DawConnectionGetStatusRequest, DawConnectionGetStatusResponse>(
        context,
        'daw.connection.getStatus',
        {},
      ),
  },
})
