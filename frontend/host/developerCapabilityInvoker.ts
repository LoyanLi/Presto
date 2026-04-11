import { PRESTO_VERSION, type CapabilityRequestMap, type CapabilityResponseMap } from '@presto/contracts'
import type { PrestoRuntime } from '@presto/sdk-runtime'

import type { DeveloperCapabilityId } from './developerCapabilityInventory'

let requestSequence = 0

export async function invokePublicCapability<TCapability extends DeveloperCapabilityId>(
  developerRuntime: Pick<PrestoRuntime, 'backend'>,
  capabilityId: TCapability,
  payload: CapabilityRequestMap[TCapability],
): Promise<CapabilityResponseMap[TCapability]> {
  const response = await developerRuntime.backend.invokeCapability<
    CapabilityRequestMap[TCapability],
    CapabilityResponseMap[TCapability]
  >({
    requestId: `developer-console-${++requestSequence}`,
    capability: capabilityId,
    payload,
    meta: {
      clientName: 'developer-console',
      clientVersion: PRESTO_VERSION,
      sdkVersion: PRESTO_VERSION,
    },
  })

  if (response.success === false) {
    throw response.error
  }

  return response.data
}
