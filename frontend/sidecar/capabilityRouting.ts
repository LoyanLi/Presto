import type { CapabilityRequestEnvelope } from '@presto/contracts'

export interface WorkflowExecutionResolver {
  resolveWorkflowExecution(input: {
    pluginId: string
    workflowId: string
  }): Promise<{
    definition: Record<string, unknown>
    allowedCapabilities: string[]
  }>
}

export async function enrichCapabilityRequestForBackend<TRequest>(
  request: CapabilityRequestEnvelope<TRequest>,
  workflowResolver: WorkflowExecutionResolver,
): Promise<CapabilityRequestEnvelope<TRequest | Record<string, unknown>>> {
  if (request.capability !== 'workflow.run.start') {
    return request
  }

  const payload =
    request.payload && typeof request.payload === 'object'
      ? (request.payload as Record<string, unknown>)
      : {}
  const pluginId = String(payload.pluginId ?? '').trim()
  const workflowId = String(payload.workflowId ?? '').trim()
  const resolved = await workflowResolver.resolveWorkflowExecution({
    pluginId,
    workflowId,
  })

  return {
    ...request,
    payload: {
      ...payload,
      definition: resolved.definition,
      allowedCapabilities: resolved.allowedCapabilities,
    },
  }
}
