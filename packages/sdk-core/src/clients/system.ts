import type {
  PublicCapabilityId,
  SystemClient,
  SystemHealthRequest,
  SystemHealthResponse,
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

export const createSystemClient = (context: PrestoClientAssemblyContext): SystemClient => ({
  health: () =>
    invokeCapability<SystemHealthRequest, SystemHealthResponse>(context, 'system.health', {}),
})
