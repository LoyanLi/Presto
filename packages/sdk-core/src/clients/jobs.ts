import type {
  JobRecord,
  JobsCancelRequest,
  JobsCancelResponse,
  JobsClient,
  JobsCreateRequest,
  JobsCreateResponse,
  JobsDeleteRequest,
  JobsDeleteResponse,
  JobsGetRequest,
  JobsGetResponse,
  JobsListRequest,
  JobsListResponse,
  JobsUpdateRequest,
  JobsUpdateResponse,
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

export const createJobsClient = (context: PrestoClientAssemblyContext): JobsClient => ({
  create: (request: JobsCreateRequest) =>
    invokeCapability<JobsCreateRequest, JobsCreateResponse>(context, 'jobs.create', request),
  update: (request: JobsUpdateRequest) =>
    invokeCapability<JobsUpdateRequest, JobsUpdateResponse>(context, 'jobs.update', request),
  get: async (jobId: string): Promise<JobRecord> => {
    const response = await invokeCapability<JobsGetRequest, JobsGetResponse>(
      context,
      'jobs.get',
      { jobId },
    )

    return response.job
  },
  list: (filter?: JobsListRequest) =>
    invokeCapability<JobsListRequest, JobsListResponse>(
      context,
      'jobs.list',
      filter ?? {},
    ),
  cancel: (jobId: string) =>
    invokeCapability<JobsCancelRequest, JobsCancelResponse>(context, 'jobs.cancel', { jobId }),
  delete: (jobId: string) =>
    invokeCapability<JobsDeleteRequest, JobsDeleteResponse>(context, 'jobs.delete', { jobId }),
})
