"""Import orchestration for Pro Tools automation workflow."""

from __future__ import annotations

import logging
from datetime import datetime
from pathlib import Path
from typing import Callable, Protocol

from presto.domain.errors import PrestoError, ValidationError
from presto.domain.models import (
    ImportItem,
    ResolvedImportItem,
    RunReport,
    SilenceProfile,
    TrackProcessResult,
    allocate_unique_track_name,
    is_supported_audio_file,
    sanitize_track_component,
)


class GatewayProtocol(Protocol):
    """Protocol for PTSL gateway dependency."""

    def connect(self) -> None:
        ...

    def ensure_session_open(self) -> str:
        ...

    def ensure_track_color_supported(self) -> None:
        ...

    def list_track_names(self) -> list[str]:
        ...

    def import_audio_file(self, path: str) -> str:
        ...

    def rename_track(self, current_name: str, new_name: str) -> None:
        ...

    def select_track(self, name: str) -> None:
        ...

    def apply_track_color(self, slot: int, track_name: str) -> None:
        ...

    def select_all_clips_on_track(self, name: str) -> None:
        ...

    def save_session(self) -> None:
        ...


class UiAutomationProtocol(Protocol):
    """Protocol for UI automation dependency."""

    def preflight_accessibility(self) -> None:
        ...

    def open_strip_silence_window(self) -> None:
        ...

    def strip_silence(self, track_name: str, profile: SilenceProfile) -> None:
        ...


class ImportOrchestrator:
    """Coordinates import, coloring, and strip silence operations."""

    def __init__(
        self,
        gateway: GatewayProtocol,
        ui_automation: UiAutomationProtocol,
        logger: logging.Logger | None = None,
    ) -> None:
        self.gateway = gateway
        self.ui_automation = ui_automation
        self.logger = logger or logging.getLogger(__name__)

    def preflight(self) -> str:
        """Validate Pro Tools and accessibility prerequisites."""

        self.gateway.connect()
        session_path = self.gateway.ensure_session_open()
        self.gateway.ensure_track_color_supported()
        self.ui_automation.preflight_accessibility()
        return session_path

    def prepare_strip_silence(self) -> None:
        """Open Strip Silence before batch so user can confirm parameters."""

        self.ui_automation.open_strip_silence_window()

    def run_resolved(
        self,
        items: list[ResolvedImportItem],
        category_map: dict[str, tuple[str, int]],
        silence_profile: SilenceProfile,
        progress_callback: Callable[[int, int, str], None] | None = None,
    ) -> RunReport:
        """Run batch using pre-resolved target names."""

        started_at = datetime.now()
        existing_names = set(self.gateway.list_track_names())
        results: list[TrackProcessResult] = []
        total_items = len(items)
        processed_items = 0

        for item in items:
            current_name = Path(item.file_path).name
            if not is_supported_audio_file(item.file_path):
                results.append(
                    TrackProcessResult(
                        file_path=item.file_path,
                        track_name=None,
                        status="skipped",
                        error_code="UNSUPPORTED_FORMAT",
                        error_message="Only WAV/AIFF files are supported.",
                    )
                )
                processed_items += 1
                if progress_callback is not None:
                    progress_callback(processed_items, total_items, current_name)
                continue

            category = category_map.get(item.category_id)
            if category is None:
                results.append(
                    TrackProcessResult(
                        file_path=item.file_path,
                        track_name=None,
                        status="failed",
                        error_code="CATEGORY_NOT_FOUND",
                        error_message=f"Category '{item.category_id}' does not exist.",
                    )
                )
                processed_items += 1
                if progress_callback is not None:
                    progress_callback(processed_items, total_items, current_name)
                continue

            _category_name, color_slot = category
            try:
                imported_track = self.gateway.import_audio_file(item.file_path)
                desired = allocate_unique_track_name(
                    sanitize_track_component(item.target_track_name),
                    existing_names,
                )

                self.gateway.rename_track(imported_track, desired)
                self.gateway.select_track(desired)
                self._apply_track_color_with_fallback(color_slot, desired)
                self.gateway.select_all_clips_on_track(desired)
                self.ui_automation.strip_silence(desired, silence_profile)

                existing_names.add(desired)
                results.append(
                    TrackProcessResult(
                        file_path=item.file_path,
                        track_name=desired,
                        status="success",
                        error_code=None,
                        error_message=None,
                    )
                )
            except PrestoError as exc:
                self.logger.exception("Track failed: %s", item.file_path)
                results.append(
                    TrackProcessResult(
                        file_path=item.file_path,
                        track_name=None,
                        status="failed",
                        error_code=exc.code,
                        error_message=exc.message,
                    )
                )
            except Exception as exc:  # pragma: no cover - defensive fallback
                self.logger.exception("Unexpected track failure: %s", item.file_path)
                results.append(
                    TrackProcessResult(
                        file_path=item.file_path,
                        track_name=None,
                        status="failed",
                        error_code="UNEXPECTED_ERROR",
                        error_message=str(exc),
                    )
                )
            finally:
                processed_items += 1
                if progress_callback is not None:
                    progress_callback(processed_items, total_items, current_name)

        finished_at = datetime.now()
        return RunReport.from_results(started_at, finished_at, results)

    def run(
        self,
        items: list[ImportItem],
        category_map: dict[str, tuple[str, int]],
        silence_profile: SilenceProfile,
        progress_callback: Callable[[int, int, str], None] | None = None,
    ) -> RunReport:
        """Run a full batch import and processing job."""

        started_at = datetime.now()
        existing_names = set(self.gateway.list_track_names())
        results: list[TrackProcessResult] = []
        total_items = len(items)
        processed_items = 0

        for item in items:
            current_name = Path(item.file_path).name
            if not is_supported_audio_file(item.file_path):
                results.append(
                    TrackProcessResult(
                        file_path=item.file_path,
                        track_name=None,
                        status="skipped",
                        error_code="UNSUPPORTED_FORMAT",
                        error_message="Only WAV/AIFF files are supported.",
                    )
                )
                processed_items += 1
                if progress_callback is not None:
                    progress_callback(processed_items, total_items, current_name)
                continue

            category = category_map.get(item.category_id)
            if category is None:
                results.append(
                    TrackProcessResult(
                        file_path=item.file_path,
                        track_name=None,
                        status="failed",
                        error_code="CATEGORY_NOT_FOUND",
                        error_message=f"Category '{item.category_id}' does not exist.",
                    )
                )
                processed_items += 1
                if progress_callback is not None:
                    progress_callback(processed_items, total_items, current_name)
                continue

            category_name, color_slot = category
            try:
                imported_track = self.gateway.import_audio_file(item.file_path)
                stem = sanitize_track_component(Path(item.file_path).stem)
                category_label = sanitize_track_component(category_name)
                desired = allocate_unique_track_name(
                    f"{category_label}__{stem}",
                    existing_names,
                )

                self.gateway.rename_track(imported_track, desired)
                self.gateway.select_track(desired)
                self._apply_track_color_with_fallback(color_slot, desired)
                self.gateway.select_all_clips_on_track(desired)
                self.ui_automation.strip_silence(desired, silence_profile)

                existing_names.add(desired)
                results.append(
                    TrackProcessResult(
                        file_path=item.file_path,
                        track_name=desired,
                        status="success",
                        error_code=None,
                        error_message=None,
                    )
                )
            except PrestoError as exc:
                self.logger.exception("Track failed: %s", item.file_path)
                results.append(
                    TrackProcessResult(
                        file_path=item.file_path,
                        track_name=None,
                        status="failed",
                        error_code=exc.code,
                        error_message=exc.message,
                    )
                )
            except Exception as exc:  # pragma: no cover - defensive fallback
                self.logger.exception("Unexpected track failure: %s", item.file_path)
                results.append(
                    TrackProcessResult(
                        file_path=item.file_path,
                        track_name=None,
                        status="failed",
                        error_code="UNEXPECTED_ERROR",
                        error_message=str(exc),
                    )
                )
            finally:
                processed_items += 1
                if progress_callback is not None:
                    progress_callback(processed_items, total_items, current_name)

        finished_at = datetime.now()
        return RunReport.from_results(started_at, finished_at, results)

    def _apply_track_color_with_fallback(self, slot: int, track_name: str) -> None:
        """Apply track color with a UI fallback for palette consistency."""

        gateway_error: PrestoError | None = None
        try:
            self.gateway.apply_track_color(slot, track_name)
        except PrestoError as exc:
            gateway_error = exc
            self.logger.warning(
                "PTSL SetTrackColor failed for '%s' (slot=%s): %s. Falling back to UI automation.",
                track_name,
                slot,
                exc.message,
            )

        if gateway_error is None:
            return

        try:
            self.ui_automation.apply_track_color(slot, track_name)
        except PrestoError as exc:
            raise exc

    @staticmethod
    def build_category_map(categories: list[tuple[str, str, int]]) -> dict[str, tuple[str, int]]:
        """Convert UI category tuples into orchestrator map."""

        category_map: dict[str, tuple[str, int]] = {}
        for category_id, name, slot in categories:
            if not category_id:
                raise ValidationError("INVALID_CATEGORY", "Category ID cannot be empty.")
            category_map[category_id] = (name, slot)
        return category_map
