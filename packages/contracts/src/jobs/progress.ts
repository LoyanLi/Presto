export interface JobProgress {
  phase: string
  current: number
  total: number
  percent: number
  message?: string
}
