"""Domain models for export workflow."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Literal

ExportAudioFormat = Literal["wav", "aiff"]
ExportMixSourceType = Literal["PhysicalOut", "Bus", "Output"]
ExportTaskStatus = Literal["pending", "running", "completed", "completed_with_errors", "failed", "cancelled"]
ExportSnapshotItemStatus = Literal["success", "failed", "cancelled"]


@dataclass(frozen=True)
class SessionInfoLite:
    """Minimal Pro Tools session metadata for export UI."""

    session_name: str
    session_path: str
    sample_rate: int
    bit_depth: int


@dataclass(frozen=True)
class TrackStateLite:
    """Minimal track state snapshot from Pro Tools."""

    track_id: str
    track_name: str
    track_type: str
    is_soloed: bool
    is_muted: bool
    color: str | None


@dataclass(frozen=True)
class ExportTrackState:
    """Track state persisted inside an export snapshot."""

    track_id: str
    track_name: str
    is_soloed: bool
    is_muted: bool
    track_type: str
    color: str | None


@dataclass(frozen=True)
class ExportSnapshot:
    """Named snapshot of solo/mute states."""

    id: str
    name: str
    track_states: list[ExportTrackState]
    created_at: str
    updated_at: str | None


@dataclass(frozen=True)
class ExportSettings:
    """User-configured export settings."""

    file_format: ExportAudioFormat
    mix_source_name: str
    mix_source_type: ExportMixSourceType
    online_export: bool
    file_prefix: str
    output_path: str


@dataclass(frozen=True)
class ExportPreset:
    """Reusable export settings subset."""

    id: str
    name: str
    file_format: ExportAudioFormat
    mix_source_name: str
    mix_source_type: ExportMixSourceType
    created_at: str
    updated_at: str | None


@dataclass(frozen=True)
class ExportFileMeta:
    """Gateway export result for one bounce command."""

    success: bool
    output_path: str
    file_size: int | None
    sample_rate: int | None
    bit_depth: int | None
    file_format: ExportAudioFormat
    cancelled: bool
    error_message: str | None


@dataclass(frozen=True)
class ApplySnapshotReport:
    """Report returned when applying one snapshot."""

    success: bool
    total_tracks: int
    success_count: int
    error_count: int
    skipped_count: int
    errors: list[str]


@dataclass(frozen=True)
class ExportSnapshotResult:
    """Per-snapshot batch result."""

    snapshot_id: str
    snapshot_name: str
    status: ExportSnapshotItemStatus
    output_file: str | None
    error_code: str | None
    error_message: str | None


@dataclass(frozen=True)
class ExportRunProgress:
    """Progress event for running export batch."""

    task_id: str
    status: ExportTaskStatus
    current_index: int
    total: int
    current_snapshot_name: str
    progress_percent: float


@dataclass(frozen=True)
class ExportRunReport:
    """Final export batch summary."""

    task_id: str
    status: ExportTaskStatus
    exported_files: list[str]
    failed_snapshots: list[str]
    results: list[ExportSnapshotResult]
    started_at: datetime
    finished_at: datetime
    total_duration_sec: float
    error_message: str | None


@dataclass
class ExportCancelToken:
    """Cooperative cancellation token."""

    cancelled: bool = False

    def cancel(self) -> None:
        self.cancelled = True

