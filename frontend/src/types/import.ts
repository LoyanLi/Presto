export type ProposalStatus = 'ready' | 'failed' | 'skipped'
export type RunStatus = 'pending' | 'running' | 'completed' | 'completed_with_errors' | 'failed' | 'cancelled'

export interface CategoryTemplate {
  id: string
  name: string
  pt_color_slot: number
  preview_hex: string
}

export interface SilenceProfile {
  threshold_db: number
  min_strip_ms: number
  min_silence_ms: number
  start_pad_ms: number
  end_pad_ms: number
}

export interface AiNamingConfig {
  enabled: boolean
  base_url: string
  model: string
  timeout_seconds: number
  keychain_service: string
  keychain_account: string
}

export interface UiPreferences {
  logs_collapsed_by_default: boolean
  follow_system_theme: boolean
  developer_mode_enabled: boolean
}

export interface AppConfigDto {
  categories: CategoryTemplate[]
  silence_profile: SilenceProfile
  ai_naming: AiNamingConfig
  ui_preferences: UiPreferences
}

export interface ImportAnalyzeItem {
  file_path: string
  category_id: string
}

export interface RenameProposal {
  file_path: string
  category_id: string
  original_stem: string
  ai_name: string
  final_name: string
  status: ProposalStatus
  error_message: string | null
}

export interface ResolvedImportItem {
  file_path: string
  category_id: string
  target_track_name: string
}

export interface ImportRunResult {
  total: number
  success_count: number
  failed_count: number
  results: Array<{
    file_path: string
    track_name: string | null
    status: 'success' | 'failed' | 'skipped'
    error_code: string | null
    error_message: string | null
  }>
}

export interface ImportRunState {
  run_id: string
  status: RunStatus
  progress: number
  current_index: number
  total: number
  current_name: string
  created_at: string
  started_at: string | null
  finished_at: string | null
  result: ImportRunResult | null
  error_code: string | null
  error_message: string | null
}
