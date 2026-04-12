import type {
  ExportClient,
  ExportDirectStartRequest,
  ExportDirectStartResponse,
  ExportMixWithSourceRequest,
  ExportMixWithSourceResponse,
  ExportRangeSetRequest,
  ExportRangeSetResponse,
  ExportRunStartRequest,
  ExportRunStartResponse,
  ExportStartRequest,
  ExportStartResponse,
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

export const createExportClient = (context: PrestoClientAssemblyContext): ExportClient => ({
  range: {
    set: (request: ExportRangeSetRequest) =>
      invokeCapability<ExportRangeSetRequest, ExportRangeSetResponse>(
        context,
        'daw.export.range.set',
        request,
      ),
  },
  start: (request: ExportStartRequest) =>
    invokeCapability<ExportStartRequest, ExportStartResponse>(context, 'daw.export.start', request),
  direct: {
    start: (request: ExportDirectStartRequest) =>
      invokeCapability<ExportDirectStartRequest, ExportDirectStartResponse>(
        context,
        'daw.export.direct.start',
        request,
      ),
  },
  mixSource: {
    list: (request: ExportMixWithSourceRequest) =>
      invokeCapability<ExportMixWithSourceRequest, ExportMixWithSourceResponse>(
        context,
        'daw.export.mixWithSource',
        request,
      ),
  },
  run: {
    start: (request: ExportRunStartRequest) =>
      invokeCapability<ExportRunStartRequest, ExportRunStartResponse>(
        context,
        'daw.export.run.start',
        request,
      ),
  },
})
