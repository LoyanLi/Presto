from __future__ import annotations

import tempfile
from pathlib import Path
import unittest

from presto.domain.errors import ValidationError
from presto.infra.export_preset_store import ExportPresetStore


class _TestPresetStore(ExportPresetStore):
    def __init__(self, root: Path) -> None:
        super().__init__()
        self._root = root

    def preset_file_path(self) -> Path:
        return self._root / "Tracktodo" / "presets.json"


class ExportPresetStoreTests(unittest.TestCase):
    def test_create_update_delete_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = _TestPresetStore(Path(tmp))
            created = store.create(
                name="Default",
                file_format="wav",
                mix_source_name="Ref Print",
                mix_source_type="Bus",
            )
            self.assertEqual(created.name, "Default")
            self.assertEqual(len(store.load()), 1)

            renamed = store.update_name(created.id, "Default_2")
            self.assertEqual(renamed.name, "Default_2")

            store.delete(created.id)
            self.assertEqual(store.load(), [])

    def test_duplicate_name_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = _TestPresetStore(Path(tmp))
            store.create(
                name="Music",
                file_format="wav",
                mix_source_name="Ref Print",
                mix_source_type="Bus",
            )
            with self.assertRaises(ValidationError) as ctx:
                store.create(
                    name="music",
                    file_format="aiff",
                    mix_source_name="Print",
                    mix_source_type="Output",
                )
            self.assertEqual(ctx.exception.code, "EXPORT_PRESET_IO_FAILED")


if __name__ == "__main__":
    unittest.main()

