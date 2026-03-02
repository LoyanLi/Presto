from __future__ import annotations

from dataclasses import replace
from datetime import datetime
from pathlib import Path
import tempfile
import unittest

from presto.app.export_orchestrator import ExportOrchestrator
from presto.domain.export_models import (
    ExportCancelToken,
    ExportSettings,
    ExportSnapshot,
    ExportTrackState,
    SessionInfoLite,
    TrackStateLite,
)
from presto.infra.export_preset_store import ExportPresetStore
from presto.infra.export_snapshot_store import ExportSnapshotStore


class _FakeGateway:
    def __init__(self, session_path: str, fail_index: int | None = None) -> None:
        self._session_path = session_path
        self._tracks = [
            TrackStateLite("1", "Kick", "audio", False, False, None),
            TrackStateLite("2", "Bass", "audio", False, False, None),
        ]
        self._export_idx = 0
        self._fail_index = fail_index
        self.cancelled = False

    def connect(self) -> None:
        return None

    def ensure_session_open(self) -> str:
        return self._session_path

    def get_session_info(self) -> SessionInfoLite:
        return SessionInfoLite(
            session_name="S",
            session_path=self._session_path,
            sample_rate=48000,
            bit_depth=24,
        )

    def list_tracks(self) -> list[TrackStateLite]:
        return list(self._tracks)

    def set_track_mute_state(self, track_names: list[str], enabled: bool) -> None:
        for idx, track in enumerate(self._tracks):
            if track.track_name in track_names:
                self._tracks[idx] = replace(track, is_muted=enabled)

    def set_track_solo_state(self, track_names: list[str], enabled: bool) -> None:
        for idx, track in enumerate(self._tracks):
            if track.track_name in track_names:
                self._tracks[idx] = replace(track, is_soloed=enabled)

    def set_bounce_range(self, start_time: float | None, end_time: float | None) -> None:
        return None

    def export_mix_with_source(self, output_path: str, source_name: str, source_type: str, file_format: str, offline_bounce: bool):
        from presto.domain.export_models import ExportFileMeta

        idx = self._export_idx
        self._export_idx += 1
        if self.cancelled:
            return ExportFileMeta(False, output_path, None, None, None, file_format, True, "cancelled")
        if self._fail_index is not None and idx == self._fail_index:
            return ExportFileMeta(False, output_path, None, 48000, 24, file_format, False, "bounce fail")
        path = Path(output_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b"audio")
        return ExportFileMeta(True, output_path, 5, 48000, 24, file_format, False, None)

    def cancel_export(self) -> None:
        self.cancelled = True


class ExportOrchestratorTests(unittest.TestCase):
    def _build_snapshots(self) -> list[ExportSnapshot]:
        return [
            ExportSnapshot(
                id=f"snapshot_{idx}",
                name=f"Snap{idx}",
                track_states=[
                    ExportTrackState("1", "Kick", idx % 2 == 0, False, "audio", None),
                    ExportTrackState("2", "Bass", False, idx % 2 == 1, "audio", None),
                ],
                created_at=datetime.now().isoformat(),
                updated_at=datetime.now().isoformat(),
            )
            for idx in range(1, 4)
        ]

    def test_run_batch_continues_on_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session_dir = Path(tmp) / "Project"
            session_dir.mkdir(parents=True, exist_ok=True)
            session_path = session_dir / "Project.ptx"
            session_path.write_text("dummy", encoding="utf-8")

            gateway = _FakeGateway(str(session_path), fail_index=1)
            orchestrator = ExportOrchestrator(
                gateway=gateway,
                snapshot_store=ExportSnapshotStore(),
                preset_store=ExportPresetStore(),
            )

            report = orchestrator.run_batch(
                snapshots=self._build_snapshots(),
                settings=ExportSettings(
                    file_format="wav",
                    mix_source_name="Ref Print",
                    mix_source_type="Bus",
                    online_export=False,
                    file_prefix="Song_",
                    output_path=str(Path(tmp) / "output"),
                ),
                start_time=None,
                end_time=None,
                on_progress=lambda _p: None,
                cancel_token=ExportCancelToken(),
            )

            self.assertEqual(report.status, "completed_with_errors")
            self.assertEqual(len(report.exported_files), 2)
            self.assertEqual(len(report.failed_snapshots), 1)

    def test_cancel_before_run(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session_dir = Path(tmp) / "Project"
            session_dir.mkdir(parents=True, exist_ok=True)
            session_path = session_dir / "Project.ptx"
            session_path.write_text("dummy", encoding="utf-8")
            gateway = _FakeGateway(str(session_path))
            orchestrator = ExportOrchestrator(
                gateway=gateway,
                snapshot_store=ExportSnapshotStore(),
                preset_store=ExportPresetStore(),
            )
            token = ExportCancelToken(cancelled=True)
            report = orchestrator.run_batch(
                snapshots=self._build_snapshots(),
                settings=ExportSettings(
                    file_format="wav",
                    mix_source_name="Ref Print",
                    mix_source_type="Bus",
                    online_export=False,
                    file_prefix="Song_",
                    output_path=str(Path(tmp) / "output"),
                ),
                start_time=None,
                end_time=None,
                on_progress=lambda _p: None,
                cancel_token=token,
            )
            self.assertEqual(report.status, "cancelled")


if __name__ == "__main__":
    unittest.main()

