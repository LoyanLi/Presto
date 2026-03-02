"""Export orchestration adapted from Track2Do workflow."""

from __future__ import annotations

from datetime import datetime
import logging
from pathlib import Path
import re
import shutil
import uuid
from typing import Callable

from presto.domain.errors import PrestoError, ValidationError
from presto.domain.export_models import (
    ApplySnapshotReport,
    ExportCancelToken,
    ExportRunProgress,
    ExportRunReport,
    ExportSettings,
    ExportSnapshot,
    ExportSnapshotResult,
    ExportTrackState,
    SessionInfoLite,
    TrackStateLite,
)
from presto.infra.export_preset_store import ExportPresetStore
from presto.infra.export_snapshot_store import ExportSnapshotStore


class ExportOrchestrator:
    """Coordinates export snapshot and batch export workflow."""

    def __init__(
        self,
        gateway,
        snapshot_store: ExportSnapshotStore,
        preset_store: ExportPresetStore,
        logger: logging.Logger | None = None,
    ) -> None:
        self.gateway = gateway
        self.snapshot_store = snapshot_store
        self.preset_store = preset_store
        self.logger = logger or logging.getLogger(__name__)

    def preflight_export(self) -> SessionInfoLite:
        self.gateway.connect()
        session_path = self.gateway.ensure_session_open()
        session = self.gateway.get_session_info()
        tracks = self.gateway.list_tracks()
        if not session_path:
            raise ValidationError("EXPORT_NO_SESSION", "No open Pro Tools session.")
        if not tracks:
            raise ValidationError("EXPORT_TRACKS_EMPTY", "Current session has no tracks.")
        return session

    def load_snapshots(self, session_path: str) -> list[ExportSnapshot]:
        snapshots = self.snapshot_store.load(session_path)
        self._validate_snapshot_names_unique(snapshots)
        return snapshots

    def save_snapshots(self, session_path: str, snapshots: list[ExportSnapshot]) -> None:
        self._validate_snapshot_names_unique(snapshots)
        self.snapshot_store.save(session_path, snapshots)

    def capture_current_snapshot(self, name: str) -> ExportSnapshot:
        snapshot_name = name.strip()
        if not snapshot_name:
            raise ValidationError("EXPORT_SNAPSHOT_INVALID", "Snapshot name cannot be empty.")

        session = self.preflight_export()
        tracks = self.gateway.list_tracks()
        now = datetime.now().isoformat()
        return ExportSnapshot(
            id=f"snapshot_{uuid.uuid4().hex[:12]}",
            name=snapshot_name,
            track_states=[
                ExportTrackState(
                    track_id=track.track_id,
                    track_name=track.track_name,
                    is_soloed=track.is_soloed,
                    is_muted=track.is_muted,
                    track_type=track.track_type,
                    color=track.color,
                )
                for track in tracks
            ],
            created_at=now,
            updated_at=now,
        )

    def apply_snapshot(self, snapshot: ExportSnapshot) -> ApplySnapshotReport:
        tracks = self.gateway.list_tracks()
        if not tracks:
            raise ValidationError("EXPORT_TRACKS_EMPTY", "No tracks available while applying snapshot.")

        track_map = {track.track_name: track for track in tracks}
        mute_true: list[str] = []
        mute_false: list[str] = []
        solo_true: list[str] = []
        solo_false: list[str] = []
        skipped = 0
        errors: list[str] = []

        for target in snapshot.track_states:
            current = track_map.get(target.track_name)
            if current is None:
                errors.append(f"Track '{target.track_name}' not found in current session.")
                continue

            changed = False
            if target.is_muted != current.is_muted:
                changed = True
                (mute_true if target.is_muted else mute_false).append(target.track_name)
            if target.is_soloed != current.is_soloed:
                changed = True
                (solo_true if target.is_soloed else solo_false).append(target.track_name)
            if not changed:
                skipped += 1

        success_count = 0
        error_count = 0
        for names, enabled, action in (
            (mute_true, True, "mute"),
            (mute_false, False, "unmute"),
            (solo_true, True, "solo"),
            (solo_false, False, "unsolo"),
        ):
            for track_name in names:
                try:
                    if action in {"mute", "unmute"}:
                        self.gateway.set_track_mute_state([track_name], enabled)
                    else:
                        self.gateway.set_track_solo_state([track_name], enabled)
                    success_count += 1
                except Exception as exc:
                    error_count += 1
                    errors.append(f"{action} failed for '{track_name}': {exc}")

        return ApplySnapshotReport(
            success=True,
            total_tracks=len(snapshot.track_states),
            success_count=success_count,
            error_count=error_count,
            skipped_count=skipped,
            errors=errors,
        )

    def run_batch(
        self,
        snapshots: list[ExportSnapshot],
        settings: ExportSettings,
        start_time: float | None,
        end_time: float | None,
        on_progress: Callable[[ExportRunProgress], None],
        cancel_token: ExportCancelToken,
    ) -> ExportRunReport:
        if not snapshots:
            raise ValidationError("EXPORT_SNAPSHOT_INVALID", "No snapshots selected for export.")
        if not settings.mix_source_name.strip():
            raise ValidationError("EXPORT_SOURCE_INVALID", "Mix source name is required.")

        output_dir = Path(settings.output_path).expanduser()
        if not settings.output_path.strip():
            raise ValidationError("EXPORT_OUTPUT_PATH_INVALID", "Output path is required.")
        output_dir.mkdir(parents=True, exist_ok=True)

        session = self.preflight_export()
        self.gateway.set_bounce_range(start_time=start_time, end_time=end_time)

        task_id = f"export_{uuid.uuid4().hex[:8]}_{int(datetime.now().timestamp())}"
        started_at = datetime.now()
        results: list[ExportSnapshotResult] = []
        exported_files: list[str] = []
        failed_snapshots: list[str] = []
        status = "running"
        error_message: str | None = None

        total = len(snapshots)
        for idx, snapshot in enumerate(snapshots, start=1):
            if cancel_token.cancelled:
                status = "cancelled"
                break

            on_progress(
                ExportRunProgress(
                    task_id=task_id,
                    status="running",
                    current_index=idx,
                    total=total,
                    current_snapshot_name=snapshot.name,
                    progress_percent=((idx - 1) / total) * 100.0,
                )
            )

            try:
                self.apply_snapshot(snapshot)
            except PrestoError as exc:
                failed_snapshots.append(snapshot.name)
                results.append(
                    ExportSnapshotResult(
                        snapshot_id=snapshot.id,
                        snapshot_name=snapshot.name,
                        status="failed",
                        output_file=None,
                        error_code=exc.code,
                        error_message=exc.message,
                    )
                )
                continue
            except Exception as exc:
                failed_snapshots.append(snapshot.name)
                results.append(
                    ExportSnapshotResult(
                        snapshot_id=snapshot.id,
                        snapshot_name=snapshot.name,
                        status="failed",
                        output_file=None,
                        error_code="EXPORT_APPLY_SNAPSHOT_FAILED",
                        error_message=str(exc),
                    )
                )
                continue

            if cancel_token.cancelled:
                status = "cancelled"
                break

            try:
                session_dir = Path(session.session_path).expanduser().resolve().parent
                bounced_dir = session_dir / "Bounced Files"
                bounced_dir.mkdir(parents=True, exist_ok=True)

                suffix = ".wav" if settings.file_format == "wav" else ".aiff"
                safe_name = self._safe_file_component(snapshot.name)
                temp_path = bounced_dir / f"temp_export_{safe_name}_{int(datetime.now().timestamp())}{suffix}"
                final_path = output_dir / f"{settings.file_prefix}{safe_name}{suffix}"

                bounce_meta = self.gateway.export_mix_with_source(
                    output_path=str(temp_path),
                    source_name=settings.mix_source_name,
                    source_type=settings.mix_source_type,
                    file_format=settings.file_format,
                    offline_bounce=not settings.online_export,
                )

                if cancel_token.cancelled or bounce_meta.cancelled:
                    status = "cancelled"
                    break

                if not bounce_meta.success:
                    failed_snapshots.append(snapshot.name)
                    results.append(
                        ExportSnapshotResult(
                            snapshot_id=snapshot.id,
                            snapshot_name=snapshot.name,
                            status="failed",
                            output_file=None,
                            error_code="EXPORT_BOUNCE_FAILED",
                            error_message=bounce_meta.error_message or "Unknown bounce failure.",
                        )
                    )
                    continue

                try:
                    final_path.parent.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(temp_path), str(final_path))
                except Exception as move_exc:
                    failed_snapshots.append(snapshot.name)
                    results.append(
                        ExportSnapshotResult(
                            snapshot_id=snapshot.id,
                            snapshot_name=snapshot.name,
                            status="failed",
                            output_file=None,
                            error_code="EXPORT_MOVE_FILE_FAILED",
                            error_message=str(move_exc),
                        )
                    )
                    continue

                exported_files.append(str(final_path))
                results.append(
                    ExportSnapshotResult(
                        snapshot_id=snapshot.id,
                        snapshot_name=snapshot.name,
                        status="success",
                        output_file=str(final_path),
                        error_code=None,
                        error_message=None,
                    )
                )
            except PrestoError as exc:
                failed_snapshots.append(snapshot.name)
                results.append(
                    ExportSnapshotResult(
                        snapshot_id=snapshot.id,
                        snapshot_name=snapshot.name,
                        status="failed",
                        output_file=None,
                        error_code=exc.code,
                        error_message=exc.message,
                    )
                )
            except Exception as exc:
                failed_snapshots.append(snapshot.name)
                results.append(
                    ExportSnapshotResult(
                        snapshot_id=snapshot.id,
                        snapshot_name=snapshot.name,
                        status="failed",
                        output_file=None,
                        error_code="EXPORT_BOUNCE_FAILED",
                        error_message=str(exc),
                    )
                )

        if status == "running":
            status = "completed" if not failed_snapshots else "completed_with_errors"
        if status == "cancelled":
            error_message = "Export cancelled by user."
            if not any(result.status == "cancelled" for result in results):
                current_index = min(len(results), len(snapshots) - 1)
                if current_index < len(snapshots):
                    snap = snapshots[current_index]
                    results.append(
                        ExportSnapshotResult(
                            snapshot_id=snap.id,
                            snapshot_name=snap.name,
                            status="cancelled",
                            output_file=None,
                            error_code="EXPORT_CANCELLED",
                            error_message="Export cancelled by user.",
                        )
                    )

        finished_at = datetime.now()
        on_progress(
            ExportRunProgress(
                task_id=task_id,
                status=status,  # type: ignore[arg-type]
                current_index=min(len(results), total),
                total=total,
                current_snapshot_name=(results[-1].snapshot_name if results else ""),
                progress_percent=100.0 if status in {"completed", "completed_with_errors"} else 0.0,
            )
        )

        return ExportRunReport(
            task_id=task_id,
            status=status,  # type: ignore[arg-type]
            exported_files=exported_files,
            failed_snapshots=failed_snapshots,
            results=results,
            started_at=started_at,
            finished_at=finished_at,
            total_duration_sec=(finished_at - started_at).total_seconds(),
            error_message=error_message,
        )

    def request_cancel(self, cancel_token: ExportCancelToken) -> None:
        cancel_token.cancel()
        self.gateway.cancel_export()

    @staticmethod
    def _validate_snapshot_names_unique(snapshots: list[ExportSnapshot]) -> None:
        seen: set[str] = set()
        for snapshot in snapshots:
            key = snapshot.name.strip().lower()
            if not key:
                raise ValidationError("EXPORT_SNAPSHOT_INVALID", "Snapshot name cannot be empty.")
            if key in seen:
                raise ValidationError(
                    "EXPORT_SNAPSHOT_NAME_DUPLICATE",
                    f"Duplicate snapshot name: {snapshot.name}",
                )
            seen.add(key)

    @staticmethod
    def _safe_file_component(value: str) -> str:
        cleaned = re.sub(r"[\\/:*?\"<>|]+", "_", value).strip()
        cleaned = re.sub(r"\s+", "_", cleaned)
        return cleaned or "Snapshot"
