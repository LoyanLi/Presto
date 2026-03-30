export type AutomationStepStatus = 'pending' | 'running' | 'succeeded' | 'failed'

export interface AutomationStepState {
  id: string
  status: AutomationStepStatus
  message?: string
}

export interface SplitStereoToMonoResultItemState {
  sourceTrackName: string
  keptTrackName: string
  deletedTrackNames: string[]
}

export interface SplitStereoToMonoResultState {
  items?: SplitStereoToMonoResultItemState[]
  error?: string
}
