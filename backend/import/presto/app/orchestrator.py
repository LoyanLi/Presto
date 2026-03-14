"""Import orchestration for Pro Tools automation workflow."""

from __future__ import annotations

import logging
from dataclasses import dataclass
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

    def ensure_minimum_version(self, min_supported: str = "2025.10") -> str:
        ...

    def ensure_any_track_selected(self) -> list[str]:
        ...

    def list_track_names(self) -> list[str]:
        ...

    def import_audio_file(self, path: str) -> str:
        ...

    def import_audio_files(self, paths: list[str]) -> list[str]:
        ...

    def rename_track(self, current_name: str, new_name: str) -> None:
        ...

    def select_track(self, name: str) -> None:
        ...

    def apply_track_color(self, slot: int, track_name: str) -> None:
        ...

    def apply_track_color_batch(self, slot: int, track_names: list[str]) -> None:
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


StageProgressCallback = Callable[[str, int, int, int, int, str], None]


@dataclass
class _PreparedTrack:
    index: int
    file_path: str
    current_name: str
    desired_name: str
    color_slot: int


@dataclass
class _QueuedTrack:
    index: int
    file_path: str
    current_name: str
    category_id: str
    color_slot: int
    desired_base_name: str


class ImportOrchestrator:
    """Coordinates import, coloring, and strip silence operations."""

    def __init__(
        self,
        gateway: GatewayProtocol,
        ui_automation: UiAutomationProtocol,
        logger: logging.Logger | None = None,
        category_batch_size: int = 12,
    ) -> None:
        self.gateway = gateway
        self.ui_automation = ui_automation
        self.logger = logger or logging.getLogger(__name__)
        self.category_batch_size = max(1, int(category_batch_size))

    def preflight(self) -> str:
        """Validate Pro Tools and accessibility prerequisites."""

        self.gateway.connect()
        session_path = self.gateway.ensure_session_open()
        try:
            self.gateway.ensure_minimum_version()
        except PrestoError as exc:
            if exc.code != "PT_VERSION_UNKNOWN":
                raise
            self.logger.warning(
                "Skipping strict Pro Tools version gate because host version could not be detected: %s",
                exc.message,
            )
        self.gateway.ensure_track_color_supported()
        self.ui_automation.preflight_accessibility()
        return session_path

    def prepare_strip_silence(self) -> None:
        """Open Strip Silence before batch so user can confirm parameters."""

        self.gateway.ensure_any_track_selected()
        self.ui_automation.open_strip_silence_window()

    def run_resolved(
        self,
        items: list[ResolvedImportItem],
        category_map: dict[str, tuple[str, int]],
        silence_profile: SilenceProfile,
        progress_callback: Callable[[int, int, str], None] | None = None,
        stage_progress_callback: StageProgressCallback | None = None,
    ) -> RunReport:
        """Run batch using pre-resolved target names."""

        return self._run_pipeline(
            items=items,
            category_map=category_map,
            silence_profile=silence_profile,
            progress_callback=progress_callback,
            stage_progress_callback=stage_progress_callback,
            desired_name_builder=lambda item, _category: sanitize_track_component(item.target_track_name),
        )

    def run(
        self,
        items: list[ImportItem],
        category_map: dict[str, tuple[str, int]],
        silence_profile: SilenceProfile,
        progress_callback: Callable[[int, int, str], None] | None = None,
        stage_progress_callback: StageProgressCallback | None = None,
    ) -> RunReport:
        """Run a full batch import and processing job."""

        return self._run_pipeline(
            items=items,
            category_map=category_map,
            silence_profile=silence_profile,
            progress_callback=progress_callback,
            stage_progress_callback=stage_progress_callback,
            desired_name_builder=lambda item, category: (
                f"{sanitize_track_component(category)}__{sanitize_track_component(Path(item.file_path).stem)}"
            ),
        )

    def _run_pipeline(
        self,
        items: list[ImportItem] | list[ResolvedImportItem],
        category_map: dict[str, tuple[str, int]],
        silence_profile: SilenceProfile,
        desired_name_builder: Callable[[ImportItem | ResolvedImportItem, str], str],
        progress_callback: Callable[[int, int, str], None] | None,
        stage_progress_callback: StageProgressCallback | None,
    ) -> RunReport:
        started_at = datetime.now()
        existing_names = set(self.gateway.list_track_names())
        total_items = len(items)
        processed_items = 0

        potential_valid_count = sum(
            1
            for item in items
            if is_supported_audio_file(item.file_path) and item.category_id in category_map
        )
        overall_total = total_items + (potential_valid_count * 2)
        overall_current = 0

        results_by_index: dict[int, TrackProcessResult] = {}
        queued_by_category: dict[str, list[_QueuedTrack]] = {}
        category_order: list[str] = []

        # Stage 1 queueing: validate and group by category
        stage_current_import = 0
        for stage_current, item in enumerate(items, start=1):
            current_name = Path(item.file_path).name
            if not is_supported_audio_file(item.file_path):
                stage_current_import += 1
                overall_current += 1
                self._emit_stage_progress(
                    callback=stage_progress_callback,
                    stage_name="stage_import_rename",
                    stage_current=stage_current_import,
                    stage_total=total_items,
                    overall_current=overall_current,
                    overall_total=overall_total,
                    current_name=current_name,
                )
                results_by_index[stage_current - 1] = TrackProcessResult(
                    file_path=item.file_path,
                    track_name=None,
                    status="skipped",
                    error_code="UNSUPPORTED_FORMAT",
                    error_message="Only WAV/AIFF files are supported.",
                )
                processed_items += 1
                if progress_callback is not None:
                    progress_callback(processed_items, total_items, current_name)
                continue

            category = category_map.get(item.category_id)
            if category is None:
                stage_current_import += 1
                overall_current += 1
                self._emit_stage_progress(
                    callback=stage_progress_callback,
                    stage_name="stage_import_rename",
                    stage_current=stage_current_import,
                    stage_total=total_items,
                    overall_current=overall_current,
                    overall_total=overall_total,
                    current_name=current_name,
                )
                results_by_index[stage_current - 1] = TrackProcessResult(
                    file_path=item.file_path,
                    track_name=None,
                    status="failed",
                    error_code="CATEGORY_NOT_FOUND",
                    error_message=f"Category '{item.category_id}' does not exist.",
                )
                processed_items += 1
                if progress_callback is not None:
                    progress_callback(processed_items, total_items, current_name)
                continue

            category_name, color_slot = category
            if item.category_id not in queued_by_category:
                category_order.append(item.category_id)
                queued_by_category[item.category_id] = []
            queued_by_category[item.category_id].append(
                _QueuedTrack(
                    index=stage_current - 1,
                    file_path=item.file_path,
                    current_name=current_name,
                    category_id=item.category_id,
                    color_slot=color_slot,
                    desired_base_name=sanitize_track_component(desired_name_builder(item, category_name)),
                )
            )

        stage_total_color = sum(len(queued_tracks) for queued_tracks in queued_by_category.values())
        stage_total_strip = stage_total_color
        stage_current_color = 0
        stage_current_strip = 0

        # Stage 1 execution: import + rename + select in category batches
        for category_id in category_order:
            queued_tracks = queued_by_category.get(category_id, [])
            if not queued_tracks:
                continue

            for chunk in self._chunked(queued_tracks, self.category_batch_size):
                chunk_file_paths = [queued.file_path for queued in chunk]
                imported_track_by_offset: dict[int, str] = {}
                item_error_by_offset: dict[int, PrestoError] = {}
                try:
                    imported_tracks = list(self.gateway.import_audio_files(chunk_file_paths))
                except PrestoError as exc:
                    imported_tracks = []
                    for item_offset, queued in enumerate(chunk):
                        item_error_by_offset[item_offset] = ValidationError(
                            "TRACK_DETECTION_FAILED",
                            (
                                f"Batch import failed for '{queued.current_name}'. "
                                f"Retry failed: [{exc.code}] {exc.message}"
                            ),
                        )
                except Exception as exc:  # pragma: no cover - defensive fallback
                    imported_tracks = []
                    for item_offset, queued in enumerate(chunk):
                        item_error_by_offset[item_offset] = ValidationError(
                            "TRACK_DETECTION_FAILED",
                            f"Batch import failed for '{queued.current_name}'. Retry failed: {exc}",
                        )

                for item_offset, imported_track in enumerate(imported_tracks[: len(chunk)]):
                    imported_track_by_offset[item_offset] = imported_track

                if len(imported_tracks) != len(chunk):
                    mismatch_message = (
                        "Import succeeded but track detection count mismatch. "
                        f"Expected {len(chunk)} new tracks, got {len(imported_tracks)}."
                    )
                    self.logger.warning(
                        "%s Falling back to per-file retry for unresolved items in category batch.",
                        mismatch_message,
                    )
                    for item_offset in range(len(imported_tracks), len(chunk)):
                        queued = chunk[item_offset]
                        try:
                            imported_track_by_offset[item_offset] = self.gateway.import_audio_file(queued.file_path)
                        except PrestoError as exc:
                            item_error_by_offset[item_offset] = ValidationError(
                                "TRACK_DETECTION_FAILED",
                                (
                                    f"{mismatch_message} "
                                    f"Retry failed for '{queued.current_name}': [{exc.code}] {exc.message}"
                                ),
                            )
                        except Exception as exc:  # pragma: no cover - defensive fallback
                            item_error_by_offset[item_offset] = ValidationError(
                                "TRACK_DETECTION_FAILED",
                                f"{mismatch_message} Retry failed for '{queued.current_name}': {exc}",
                            )

                for item_offset, queued in enumerate(chunk):
                    stage_current_import += 1
                    overall_current += 1
                    self._emit_stage_progress(
                        callback=stage_progress_callback,
                        stage_name="stage_import_rename",
                        stage_current=stage_current_import,
                        stage_total=total_items,
                        overall_current=overall_current,
                        overall_total=overall_total,
                        current_name=queued.current_name,
                    )

                    imported_track = imported_track_by_offset.get(item_offset)
                    if imported_track is not None:
                        try:
                            desired = allocate_unique_track_name(queued.desired_base_name, existing_names)
                            self.gateway.rename_track(imported_track, desired)
                            self.gateway.select_track(desired)
                            existing_names.add(desired)
                        except PrestoError as exc:
                            item_error = ValidationError(
                                "TRACK_DETECTION_FAILED",
                                f"Retry imported '{queued.current_name}' but rename/select failed: [{exc.code}] {exc.message}",
                            )
                        except Exception as exc:  # pragma: no cover - defensive fallback
                            item_error = ValidationError(
                                "TRACK_DETECTION_FAILED",
                                f"Retry imported '{queued.current_name}' but rename/select failed: {exc}",
                            )
                        else:
                            stage_current_color += 1
                            overall_current += 1
                            self._emit_stage_progress(
                                callback=stage_progress_callback,
                                stage_name="stage_color_batch",
                                stage_current=stage_current_color,
                                stage_total=stage_total_color,
                                overall_current=overall_current,
                                overall_total=overall_total,
                                current_name=queued.current_name,
                            )

                            try:
                                self._apply_track_color_with_fallback(slot=queued.color_slot, track_name=desired)
                            except PrestoError as exc:
                                self.logger.exception("Track failed in color stage: %s", queued.file_path)
                                results_by_index[queued.index] = TrackProcessResult(
                                    file_path=queued.file_path,
                                    track_name=None,
                                    status="failed",
                                    error_code=exc.code,
                                    error_message=exc.message,
                                )
                                stage_total_strip = max(stage_current_strip, stage_total_strip - 1)
                                processed_items += 1
                                overall_total = max(overall_current, overall_total - 1)
                                if progress_callback is not None:
                                    progress_callback(processed_items, total_items, queued.current_name)
                                continue
                            except Exception as exc:  # pragma: no cover - defensive fallback
                                self.logger.exception("Unexpected track failure in color stage: %s", queued.file_path)
                                results_by_index[queued.index] = TrackProcessResult(
                                    file_path=queued.file_path,
                                    track_name=None,
                                    status="failed",
                                    error_code="UNEXPECTED_ERROR",
                                    error_message=str(exc),
                                )
                                stage_total_strip = max(stage_current_strip, stage_total_strip - 1)
                                processed_items += 1
                                overall_total = max(overall_current, overall_total - 1)
                                if progress_callback is not None:
                                    progress_callback(processed_items, total_items, queued.current_name)
                                continue

                            stage_current_strip += 1
                            overall_current += 1
                            self._emit_stage_progress(
                                callback=stage_progress_callback,
                                stage_name="stage_strip_silence",
                                stage_current=stage_current_strip,
                                stage_total=stage_total_strip,
                                overall_current=overall_current,
                                overall_total=overall_total,
                                current_name=queued.current_name,
                            )

                            try:
                                self.gateway.select_all_clips_on_track(desired)
                                self.ui_automation.strip_silence(desired, silence_profile)
                                results_by_index[queued.index] = TrackProcessResult(
                                    file_path=queued.file_path,
                                    track_name=desired,
                                    status="success",
                                    error_code=None,
                                    error_message=None,
                                )
                            except PrestoError as exc:
                                self.logger.exception("Track failed in strip stage: %s", queued.file_path)
                                results_by_index[queued.index] = TrackProcessResult(
                                    file_path=queued.file_path,
                                    track_name=None,
                                    status="failed",
                                    error_code=exc.code,
                                    error_message=exc.message,
                                )
                            except Exception as exc:  # pragma: no cover - defensive fallback
                                self.logger.exception("Unexpected track failure in strip stage: %s", queued.file_path)
                                results_by_index[queued.index] = TrackProcessResult(
                                    file_path=queued.file_path,
                                    track_name=None,
                                    status="failed",
                                    error_code="UNEXPECTED_ERROR",
                                    error_message=str(exc),
                                )
                            finally:
                                processed_items += 1
                                if progress_callback is not None:
                                    progress_callback(processed_items, total_items, queued.current_name)
                            continue
                    else:
                        item_error = item_error_by_offset.get(
                            item_offset,
                            ValidationError(
                                "TRACK_DETECTION_FAILED",
                                (
                                    "Import succeeded but track detection count mismatch. "
                                    f"Expected {len(chunk)} new tracks, got {len(imported_tracks)}."
                                ),
                            ),
                        )

                    results_by_index[queued.index] = TrackProcessResult(
                        file_path=queued.file_path,
                        track_name=None,
                        status="failed",
                        error_code=item_error.code,
                        error_message=item_error.message,
                    )
                    processed_items += 1
                    overall_total = max(overall_current, overall_total - 2)
                    stage_total_color = max(stage_current_color, stage_total_color - 1)
                    stage_total_strip = max(stage_current_strip, stage_total_strip - 1)
                    if progress_callback is not None:
                        progress_callback(processed_items, total_items, queued.current_name)

        # Stage 1 completeness guard
        if stage_current_import < total_items:
            stage_current_import = total_items

        ordered_results = [results_by_index[idx] for idx in range(total_items)]
        finished_at = datetime.now()
        return RunReport.from_results(started_at, finished_at, ordered_results)

    @staticmethod
    def _emit_stage_progress(
        callback: StageProgressCallback | None,
        stage_name: str,
        stage_current: int,
        stage_total: int,
        overall_current: int,
        overall_total: int,
        current_name: str,
    ) -> None:
        if callback is None:
            return
        callback(
            stage_name,
            stage_current,
            stage_total,
            overall_current,
            max(overall_total, 1),
            current_name,
        )

    @staticmethod
    def _chunked(values: list[_QueuedTrack], size: int) -> list[list[_QueuedTrack]]:
        if size <= 0:
            return [values]
        return [values[idx : idx + size] for idx in range(0, len(values), size)]

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
