from __future__ import annotations

import tempfile
from pathlib import Path
import unittest

from presto.domain.errors import ValidationError
from presto.domain.export_models import ExportSnapshot, ExportTrackState
from presto.infra.export_snapshot_store import ExportSnapshotStore


class ExportSnapshotStoreTests(unittest.TestCase):
    def test_save_and_load_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session_dir = Path(tmp) / "MySession"
            session_dir.mkdir(parents=True, exist_ok=True)
            session_path = session_dir / "MySession.ptx"
            session_path.write_text("dummy", encoding="utf-8")

            store = ExportSnapshotStore()
            snapshots = [
                ExportSnapshot(
                    id="snapshot_1",
                    name="Drum",
                    track_states=[
                        ExportTrackState(
                            track_id="1",
                            track_name="Kick",
                            is_soloed=True,
                            is_muted=False,
                            track_type="audio",
                            color="#ff112233",
                        )
                    ],
                    created_at="2026-03-01T20:00:00",
                    updated_at="2026-03-01T20:00:00",
                )
            ]
            store.save(str(session_path), snapshots)

            loaded = store.load(str(session_path))
            self.assertEqual(len(loaded), 1)
            self.assertEqual(loaded[0].name, "Drum")
            self.assertEqual(loaded[0].track_states[0].track_name, "Kick")

    def test_missing_file_returns_empty(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session_dir = Path(tmp) / "S1"
            session_dir.mkdir(parents=True, exist_ok=True)
            session_path = session_dir / "S1.ptx"
            session_path.write_text("dummy", encoding="utf-8")
            store = ExportSnapshotStore()
            loaded = store.load(str(session_path))
            self.assertEqual(loaded, [])

    def test_invalid_json_raises_validation_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            session_dir = Path(tmp) / "S2"
            snapshot_dir = session_dir / "snapshots"
            snapshot_dir.mkdir(parents=True, exist_ok=True)
            snapshot_file = snapshot_dir / "snapshots.json"
            snapshot_file.write_text("{invalid", encoding="utf-8")
            session_path = session_dir / "S2.ptx"
            session_path.write_text("dummy", encoding="utf-8")

            store = ExportSnapshotStore()
            with self.assertRaises(ValidationError) as ctx:
                store.load(str(session_path))
            self.assertEqual(ctx.exception.code, "EXPORT_SNAPSHOT_IO_FAILED")


if __name__ == "__main__":
    unittest.main()

