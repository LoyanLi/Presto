import type {
  PublicCapabilityId,
  TransportClient,
  TransportGetStatusRequest,
  TransportGetStatusResponse,
  TransportPlayRequest,
  TransportPlayResponse,
  TransportRecordRequest,
  TransportRecordResponse,
  TransportStopRequest,
  TransportStopResponse,
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

export const createTransportClient = (context: PrestoClientAssemblyContext): TransportClient => ({
  play: () =>
    invokeCapability<TransportPlayRequest, TransportPlayResponse>(context, 'daw.transport.play', {}),
  stop: () =>
    invokeCapability<TransportStopRequest, TransportStopResponse>(context, 'daw.transport.stop', {}),
  record: () =>
    invokeCapability<TransportRecordRequest, TransportRecordResponse>(
      context,
      'daw.transport.record',
      {},
    ),
  getStatus: () =>
    invokeCapability<TransportGetStatusRequest, TransportGetStatusResponse>(
      context,
      'daw.transport.getStatus',
      {},
    ),
})
