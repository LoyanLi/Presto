from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from presto.config.store import ConfigStore
from presto.config.defaults import CONFIG_VERSION
from presto.domain.pt_color_palette import palette_hex_for_slot


class ConfigStoreTests(unittest.TestCase):
    def test_load_creates_default_when_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            store = ConfigStore(app_support_dir=Path(tmp))
            config = store.load()

            self.assertTrue(store.config_path.exists())
            self.assertGreaterEqual(len(config.categories), 1)
            self.assertEqual(config.silence_profile.threshold_db, -48.0)
            self.assertEqual(config.version, CONFIG_VERSION)
            self.assertTrue(config.ai_naming.enabled)
            self.assertEqual(config.ai_naming.keychain_service, "Presto.AINaming")
            self.assertTrue(config.ui_preferences.logs_collapsed_by_default)
            self.assertTrue(config.ui_preferences.follow_system_theme)

    def test_load_migrates_missing_fields(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = ConfigStore(app_support_dir=root)
            store.ensure_dirs()

            with store.config_path.open("w", encoding="utf-8") as fp:
                json.dump(
                    {
                        "version": 0,
                        "categories": [{"id": "drums", "name": "Drums"}],
                        "silence_profile": {"threshold_db": -30.0},
                    },
                    fp,
                )

            config = store.load()
            self.assertEqual(config.version, CONFIG_VERSION)
            self.assertEqual(config.categories[0].pt_color_slot, 1)
            self.assertEqual(config.categories[0].preview_hex, palette_hex_for_slot(1))
            self.assertEqual(config.silence_profile.min_strip_ms, 120)
            self.assertEqual(config.ai_naming.model, "gpt-4.1-mini")
            self.assertTrue(config.ui_preferences.logs_collapsed_by_default)
            self.assertTrue(config.ui_preferences.follow_system_theme)

    def test_load_migrates_missing_ui_preferences(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            store = ConfigStore(app_support_dir=root)
            store.ensure_dirs()

            with store.config_path.open("w", encoding="utf-8") as fp:
                json.dump(
                    {
                        "version": 2,
                        "categories": [{"id": "drums", "name": "Drums", "pt_color_slot": 3}],
                        "silence_profile": {"threshold_db": -42.0},
                        "ai_naming": {"enabled": False, "model": "x-test"},
                    },
                    fp,
                )

            config = store.load()
            self.assertEqual(config.version, CONFIG_VERSION)
            self.assertFalse(config.ai_naming.enabled)
            self.assertTrue(config.ui_preferences.logs_collapsed_by_default)
            self.assertTrue(config.ui_preferences.follow_system_theme)


if __name__ == "__main__":
    unittest.main()
