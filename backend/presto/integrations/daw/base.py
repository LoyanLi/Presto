from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class DawConnectionStatus:
    connected: bool
    session_open: bool = False
    host_version: str | None = None
    session_name: str | None = None
    session_path: str | None = None


@dataclass(frozen=True)
class DawSessionInfo:
    session_name: str
    session_path: str
    sample_rate: int
    bit_depth: int
    is_playing: bool = False
    is_recording: bool = False


@dataclass(frozen=True)
class DawTrackInfo:
    track_id: str
    track_name: str
    track_type: str
    track_format: str = "unknown"
    is_muted: bool = False
    is_soloed: bool = False
    color: str | None = None


@dataclass(frozen=True)
class DawTransportStatus:
    state: str
    is_playing: bool = False
    is_recording: bool = False


@dataclass(frozen=True)
class DawAdapterCapabilitySnapshot:
    adapter_version: str
    host_version: str | None = None
    module_versions: dict[str, str] | None = None
    capability_versions: dict[str, str] | None = None


class DawAdapter(Protocol):
    def is_connected(self) -> bool: ...

    def connect(self, host: str | None = None, port: int | None = None, timeout_seconds: int | None = None) -> bool: ...

    def disconnect(self) -> None: ...

    def get_connection_status(self) -> DawConnectionStatus: ...

    def ensure_session_open(self) -> str: ...

    def get_session_info(self) -> DawSessionInfo: ...

    def get_session_length(self) -> float: ...

    def ensure_minimum_version(self) -> str: ...

    def get_adapter_capability_snapshot(self) -> DawAdapterCapabilitySnapshot: ...

    def list_track_names(self) -> list[str]: ...

    def get_selected_track_names(self) -> list[str]: ...

    def list_tracks(self) -> list[DawTrackInfo]: ...

    def play(self) -> None: ...

    def stop(self) -> None: ...

    def record(self) -> None: ...

    def get_transport_status(self) -> DawTransportStatus: ...

    def import_audio_file(self, path: str) -> str: ...

    def import_audio_files(self, paths: list[str]) -> list[str]: ...

    def set_timeline_selection(self, **kwargs) -> tuple[str, str]: ...

    def export_mix(self, **kwargs) -> None: ...

    def export_mix_with_progress(self, **kwargs) -> str: ...

    def list_export_mix_sources(self, source_type: str) -> list[str]: ...

    def rename_track(self, track_name: str, new_name: str) -> None: ...

    def select_track(self, track_name: str) -> None: ...

    def select_tracks(self, track_names: list[str]) -> None: ...

    def apply_track_color(self, track_name: str, color_slot: int) -> None: ...

    def set_track_pan(self, track_name: str, pan: float) -> None: ...

    def apply_track_color_batch(
        self,
        track_names: list[str],
        color_slot: int,
    ) -> None: ...

    def select_all_clips_on_track(self, track_name: str) -> None: ...

    def save_session(self) -> None: ...

    def set_track_mute_state(self, track_name: str, muted: bool) -> None: ...

    def set_track_solo_state(self, track_name: str, soloed: bool) -> None: ...

    def set_track_hidden_state(self, track_name: str, hidden: bool) -> None: ...

    def set_track_inactive_state(self, track_name: str, inactive: bool) -> None: ...

    def set_track_hidden_state_batch(self, track_names: list[str], hidden: bool) -> None: ...

    def set_track_inactive_state_batch(self, track_names: list[str], inactive: bool) -> None: ...

    def cancel_export(self) -> None: ...
