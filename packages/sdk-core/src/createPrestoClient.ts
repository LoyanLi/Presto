import type {
  PrestoClient,
  PrestoClientOptions,
  PrestoTransport,
  StripSilenceExecuteRequest,
  StripSilenceExecuteResponse,
  StripSilenceOpenRequest,
  StripSilenceOpenResponse,
} from '../../contracts/src'
import { createAutomationClient } from './clients/automation'
import { createExportClient } from './clients/export'
import { createClipClient } from './clients/clip'
import { createConfigClient } from './clients/config'
import { createDawClient } from './clients/daw'
import { createImportClient } from './clients/import'
import { createJobsClient } from './clients/jobs'
import { createSessionClient } from './clients/session'
import { createSystemClient } from './clients/system'
import { createTrackClient } from './clients/track'
import { createTransportClient } from './clients/transport'
import { createWorkflowClient } from './clients/workflow'
import type { PublicCapabilityId } from '../../contracts/src'
import type { StripSilenceClient } from '../../contracts/src'

export interface PrestoClientAssemblyContext {
  transport: PrestoTransport
  clientName?: string
  clientVersion?: string
  nextRequestId(): string
}

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

const createStripSilenceClient = (context: PrestoClientAssemblyContext): StripSilenceClient => ({
  open: () =>
    invokeCapability<StripSilenceOpenRequest, StripSilenceOpenResponse>(
      context,
      'stripSilence.open',
      {},
    ),
  execute: (request: StripSilenceExecuteRequest) =>
    invokeCapability<StripSilenceExecuteRequest, StripSilenceExecuteResponse>(
      context,
      'stripSilence.execute',
      request,
    ),
})

export const createPrestoClient = (options: PrestoClientOptions): PrestoClient => {
  let requestSequence = 0

  const context: PrestoClientAssemblyContext = {
    transport: options.transport,
    clientName: options.clientName,
    clientVersion: options.clientVersion,
    nextRequestId: () => `sdk-core-${++requestSequence}`,
  }

  return {
    system: createSystemClient(context),
    config: createConfigClient(context),
    daw: createDawClient(context),
    automation: createAutomationClient(context),
    session: createSessionClient(context),
    track: createTrackClient(context),
    clip: createClipClient(context),
    transport: createTransportClient(context),
    workflow: createWorkflowClient(context),
    import: createImportClient(context),
    export: createExportClient(context),
    stripSilence: createStripSilenceClient(context),
    jobs: createJobsClient(context),
  }
}
