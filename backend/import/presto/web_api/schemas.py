"""Pydantic schemas for local web API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class ApiError(BaseModel):
    success: bool = False
    error_code: str
    message: str
    details: Optional[dict[str, Any]] = None


class BaseResponse(BaseModel):
    success: bool = True
    message: str = "ok"
    timestamp: datetime = Field(default_factory=datetime.now)


class DataResponse(BaseResponse):
    data: Any = None


class ConnectionStatusResponse(BaseModel):
    connected: bool
    host: str
    port: int
    last_connected: Optional[datetime] = None


class TrackStateResponse(BaseModel):
    id: str
    name: str
    type: str
    is_muted: bool
    is_soloed: bool
    is_record_enabled: bool = False
    volume: float = 0.0
    pan: float = 0.0
    color: Optional[str] = None
    comments: Optional[str] = None


class TrackListResponse(BaseModel):
    success: bool
    message: str
    tracks: list[TrackStateResponse]
    total_count: int


class SessionInfoResponse(BaseModel):
    session_name: str
    session_path: str
    sample_rate: int
    bit_depth: int
    is_playing: bool = False
    is_recording: bool = False
    transport_state: str = "stopped"


class ImportAnalyzeItem(BaseModel):
    file_path: str
    category_id: str


class ImportAnalyzeRequest(BaseModel):
    items: list[ImportAnalyzeItem]


class ImportFinalizeProposal(BaseModel):
    file_path: str
    category_id: str
    original_stem: str
    ai_name: str
    final_name: str
    status: str
    error_message: Optional[str] = None


class ImportFinalizeRequest(BaseModel):
    proposals: list[ImportFinalizeProposal]
    manual_name_by_path: dict[str, str] = Field(default_factory=dict)


class ImportResolvedItem(BaseModel):
    file_path: str
    category_id: str
    target_track_name: str


class ImportRunRequest(BaseModel):
    items: list[ImportResolvedItem]


class ExportTrackStatePayload(BaseModel):
    trackId: str
    trackName: str
    is_soloed: bool
    is_muted: bool
    type: str
    color: Optional[str] = None


class ExportSnapshotPayload(BaseModel):
    id: str
    name: str
    trackStates: list[ExportTrackStatePayload]
    createdAt: str
    updatedAt: Optional[str] = None


class ExportSettingsPayload(BaseModel):
    file_format: str
    mix_source_name: str
    mix_source_type: str
    online_export: bool = False
    file_prefix: str
    output_path: str


class ExportRequestPayload(BaseModel):
    snapshots: list[ExportSnapshotPayload]
    export_settings: ExportSettingsPayload
    start_time: Optional[float] = None
    end_time: Optional[float] = None


class ApplySnapshotRequest(BaseModel):
    snapshot: ExportSnapshotPayload
    restore_automation: bool = True
    restore_plugins: bool = True
    restore_sends: bool = True


class ConfigCategoryPayload(BaseModel):
    id: str
    name: str
    pt_color_slot: int
    preview_hex: Optional[str] = None


class SilenceProfilePayload(BaseModel):
    threshold_db: float
    min_strip_ms: int
    min_silence_ms: int
    start_pad_ms: int
    end_pad_ms: int


class AiNamingConfigPayload(BaseModel):
    enabled: bool
    base_url: str
    model: str
    timeout_seconds: int
    keychain_service: str
    keychain_account: str


class UiPreferencesPayload(BaseModel):
    logs_collapsed_by_default: bool
    follow_system_theme: bool
    developer_mode_enabled: bool = False


class ConfigUpdateRequest(BaseModel):
    categories: list[ConfigCategoryPayload]
    silence_profile: SilenceProfilePayload
    ai_naming: AiNamingConfigPayload
    ui_preferences: UiPreferencesPayload
    api_key: Optional[str] = None


class AiKeyUpdateRequest(BaseModel):
    api_key: str
