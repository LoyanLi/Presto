import type {
  ImportClient,
  ImportRunStartRequest,
  ImportRunStartResponse,
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

export const createImportClient = (context: PrestoClientAssemblyContext): ImportClient => ({
  run: {
    start: (request: ImportRunStartRequest) =>
      invokeCapability<ImportRunStartRequest, ImportRunStartResponse>(
        context,
        'import.run.start',
        request,
      ),
  },
})
