"""Domain models and utility helpers."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Literal

ProcessStatus = Literal["success", "failed", "skipped"]
ProposalStatus = Literal["ready", "failed", "skipped"]
ALLOWED_AUDIO_EXTENSIONS = {".wav", ".aif", ".aiff"}


@dataclass(frozen=True)
class CategoryTemplate:
    """Instrument category -> Pro Tools color mapping."""

    id: str
    name: str
    pt_color_slot: int
    preview_hex: str


@dataclass(frozen=True)
class SilenceProfile:
    """Global Strip Silence profile."""

    threshold_db: float
    min_strip_ms: int
    min_silence_ms: int
    start_pad_ms: int
    end_pad_ms: int


@dataclass(frozen=True)
class ImportItem:
    """One audio file import task."""

    file_path: str
    category_id: str


@dataclass(frozen=True)
class ResolvedImportItem:
    """Import item with resolved target track name."""

    file_path: str
    category_id: str
    target_track_name: str


@dataclass(frozen=True)
class RenameProposal:
    """AI rename proposal before/after user confirmation."""

    file_path: str
    category_id: str
    original_stem: str
    ai_name: str
    final_name: str
    status: ProposalStatus
    error_message: str | None


@dataclass(frozen=True)
class AiNamingConfig:
    """Runtime configuration for AI naming API."""

    enabled: bool
    base_url: str
    model: str
    timeout_seconds: int
    keychain_service: str
    keychain_account: str


@dataclass(frozen=True)
class UiPreferences:
    """UI-level preferences persisted in config."""

    logs_collapsed_by_default: bool
    follow_system_theme: bool


@dataclass(frozen=True)
class TrackProcessResult:
    """Result of processing one item."""

    file_path: str
    track_name: str | None
    status: ProcessStatus
    error_code: str | None
    error_message: str | None


@dataclass(frozen=True)
class RunReport:
    """Batch execution summary."""

    started_at: datetime
    finished_at: datetime
    total: int
    success_count: int
    failed_count: int
    results: list[TrackProcessResult]

    @classmethod
    def from_results(
        cls,
        started_at: datetime,
        finished_at: datetime,
        results: list[TrackProcessResult],
    ) -> "RunReport":
        success_count = sum(1 for result in results if result.status == "success")
        failed_count = sum(1 for result in results if result.status == "failed")
        return cls(
            started_at=started_at,
            finished_at=finished_at,
            total=len(results),
            success_count=success_count,
            failed_count=failed_count,
            results=results,
        )


@dataclass(frozen=True)
class AppConfig:
    """Persisted app-level configuration."""

    version: int
    categories: list[CategoryTemplate]
    silence_profile: SilenceProfile
    ai_naming: AiNamingConfig
    ui_preferences: UiPreferences


def is_supported_audio_file(file_path: str) -> bool:
    """Return True for WAV/AIFF extensions."""

    return Path(file_path).suffix.lower() in ALLOWED_AUDIO_EXTENSIONS


def sanitize_track_component(value: str) -> str:
    """Sanitize a track name component for stable renaming."""

    cleaned = "".join(ch for ch in value if ch not in "\\/:*?\"<>|")
    cleaned = cleaned.replace("\n", " ").strip()
    return cleaned or "Untitled"


def allocate_unique_track_name(base_name: str, existing_names: set[str]) -> str:
    """Allocate non-conflicting track name with numeric suffix."""

    if base_name not in existing_names:
        return base_name

    index = 2
    while True:
        candidate = f"{base_name}_{index}"
        if candidate not in existing_names:
            return candidate
        index += 1
