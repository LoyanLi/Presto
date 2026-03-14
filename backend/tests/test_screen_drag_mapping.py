from __future__ import annotations

import unittest
from pathlib import Path

from presto.domain.errors import UiAutomationError
from presto.infra.protools_ui_automation import ProToolsUiAutomation


class _CaptureScriptAutomation(ProToolsUiAutomation):
    def __init__(self, selector_map_path: Path | None = None) -> None:
        super().__init__(selector_map_path=selector_map_path, retry_count=1, timeout_seconds=1)
        self.captured_scripts: list[str] = []

    def _run_script(self, script: str) -> str:
        self.captured_scripts.append(script)
        return ""


class _AlwaysFailOpenStripAutomation(ProToolsUiAutomation):
    def __init__(self, selector_map_path: Path | None = None, retry_count: int = 3) -> None:
        super().__init__(selector_map_path=selector_map_path, retry_count=retry_count, timeout_seconds=1)
        self.script_calls = 0

    def _run_script(self, script: str) -> str:
        self.script_calls += 1
        raise UiAutomationError("UI_ACTION_FAILED", "forced failure")


class UiAutomationSelectorMapTests(unittest.TestCase):
    def test_default_selector_map_is_en_us(self) -> None:
        automation = ProToolsUiAutomation()
        self.assertEqual(automation.selector_map_path.name, "selector_map_en_us.json")

    def test_preflight_requires_english_window_menu(self) -> None:
        selector_path = (
            Path(__file__)
            .resolve()
            .parents[1]
            / "import"
            / "presto"
            / "infra"
            / "selector_map_en_us.json"
        )
        automation = _CaptureScriptAutomation(selector_map_path=selector_path)
        automation.preflight_accessibility()
        script = automation.captured_scripts[-1]
        self.assertIn('menu bar item "Window"', script)

    def test_open_strip_window_does_not_retry_to_avoid_toggle_close(self) -> None:
        selector_path = (
            Path(__file__)
            .resolve()
            .parents[1]
            / "import"
            / "presto"
            / "infra"
            / "selector_map_en_us.json"
        )
        automation = _AlwaysFailOpenStripAutomation(selector_map_path=selector_path, retry_count=3)
        with self.assertRaises(UiAutomationError):
            automation.open_strip_silence_window()
        self.assertEqual(automation.script_calls, 1)

    def test_open_strip_checks_window_before_shortcut(self) -> None:
        selector_path = (
            Path(__file__)
            .resolve()
            .parents[1]
            / "import"
            / "presto"
            / "infra"
            / "selector_map_en_us.json"
        )
        automation = _CaptureScriptAutomation(selector_map_path=selector_path)
        automation.open_strip_silence_window()
        script = automation.captured_scripts[-1]
        self.assertIn('set windowFound to (exists window "Strip Silence")', script)
        self.assertIn('if windowFound is false then', script)

    def test_selector_map_has_minimum_required_fields(self) -> None:
        selector_path = (
            Path(__file__)
            .resolve()
            .parents[1]
            / "import"
            / "presto"
            / "infra"
            / "selector_map_en_us.json"
        )
        automation = ProToolsUiAutomation(selector_map_path=selector_path)

        self.assertEqual(automation.selector_map["pro_tools_process_name"], "Pro Tools")
        self.assertIn("color_palette", automation.selector_map["menus"])
        self.assertEqual(automation.selector_map["windows"]["strip_silence"]["name"], "Strip Silence")
        self.assertEqual(automation.selector_map["windows"]["strip_silence"]["strip_button"], "Strip")
        self.assertNotIn("screen_drag", automation.selector_map)


if __name__ == "__main__":
    unittest.main()
