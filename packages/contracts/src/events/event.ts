export type PrestoEventName =
  | 'job.created'
  | 'job.started'
  | 'job.progress'
  | 'job.succeeded'
  | 'job.failed'
  | 'job.cancelled'
  | 'backend.warning'
  | 'backend.error'
  | 'daw.connection.changed'

export interface PrestoEvent<TName extends PrestoEventName = PrestoEventName, TPayload = unknown> {
  name: TName
  payload: TPayload
  timestamp: string
}
