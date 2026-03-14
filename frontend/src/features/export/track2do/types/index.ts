// Track state interface
export interface Track {
  id: string
  name: string
  is_soloed: boolean
  is_muted: boolean
  is_record_enabled: boolean
  type: 'audio' | 'midi' | 'aux' | 'master' | 'instrument'
  volume: number
  pan: number
  color?: string
  comments?: string
}

// Track state (for snapshots)
export interface TrackState {
  trackId: string
  trackName: string
  is_soloed: boolean
  is_muted: boolean
  type: 'audio' | 'midi' | 'aux' | 'master' | 'instrument'
  color?: string
}

// Snapshot interface
export interface Snapshot {
  id: string
  name: string
  trackStates: TrackState[]
  createdAt: string
  updatedAt?: string
}

// Export related interfaces
export enum AudioFormat {
  WAV = 'wav',
  AIFF = 'aiff'
}

export enum ExportType {
  STEREO = 'stereo',
  MONO = 'mono',
  MULTI_CHANNEL = 'multi_channel'
}

export enum MixSourceType {
  PHYSICAL_OUT = 'PhysicalOut',
  BUS = 'Bus',
  OUTPUT = 'Output'
}

export interface ExportSettings {
  file_format: AudioFormat;
  mix_source_name: string;
  mix_source_type: MixSourceType;
  online_export: boolean;
  file_prefix: string;
  output_path: string;
}

// Export preset interface
export interface ExportPreset {
  id: string;
  name: string;
  file_format: AudioFormat;
  mix_source_name: string;
  mix_source_type: MixSourceType;
  createdAt: string;
  updatedAt?: string;
}

export interface ExportRequest {
  snapshots: Snapshot[];
  export_settings: ExportSettings;
  start_time?: number;
  end_time?: number;
}

export interface ExportProgress {
  task_id: string;
  status: string;
  progress: number;
  eta_seconds?: number;
  current_snapshot: number;
  total_snapshots: number;
  current_snapshot_name: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  result?: ExportResult;
}

export interface ExportResult {
  success: boolean;
  exported_files: string[];
  failed_snapshots: string[];
  total_duration: number;
  error_message?: string;
}

export interface ExportResponse {
  success: boolean;
  message: string;
  task_id?: string;
}

// Pro Tools connection status
export interface ConnectionStatus {
  isConnected: boolean
  sessionName?: string
  sessionPath?: string
  version?: string
  sampleRate?: number
  bitDepth?: number
  trackCount?: number
}

// API response interface
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
}

// WebSocket message types
export interface WebSocketMessage {
  type: 'progress' | 'status' | 'error' | 'complete'
  data: any
}

// Error handling interface
export interface AppError {
  code: string
  message: string
  details?: any
}

// Electron API global typing is sourced from frontend/src/types/electron.d.ts.
