import type {
  ImportClient,
  ImportAnalyzeRequest,
  ImportAnalyzeResponse,
  ImportCacheSaveRequest,
  ImportCacheSaveResponse,
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
  analyze: (request: ImportAnalyzeRequest) =>
    invokeCapability<ImportAnalyzeRequest, ImportAnalyzeResponse>(
      context,
      'import.analyze',
      request,
    ),
  cache: {
    save: (request: ImportCacheSaveRequest) =>
      invokeCapability<ImportCacheSaveRequest, ImportCacheSaveResponse>(
        context,
        'import.cache.save',
        request,
      ),
  },
  run: {
    start: (request: ImportRunStartRequest) =>
      invokeCapability<ImportRunStartRequest, ImportRunStartResponse>(
        context,
        'import.run.start',
        request,
      ),
  },
})
