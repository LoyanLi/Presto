import type {
  ConfigClient,
  ConfigGetRequest,
  ConfigGetResponse,
  ConfigUpdateRequest,
  ConfigUpdateResponse,
  PublicCapabilityId,
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

export const createConfigClient = (context: PrestoClientAssemblyContext): ConfigClient => ({
  get: () => invokeCapability<ConfigGetRequest, ConfigGetResponse>(context, 'config.get', {}),
  update: (request: ConfigUpdateRequest) =>
    invokeCapability<ConfigUpdateRequest, ConfigUpdateResponse>(context, 'config.update', request),
})
