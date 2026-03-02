from __future__ import annotations

import unittest
from pathlib import Path

from presto.infra.protools_ui_automation import ProToolsUiAutomation


class UiAutomationSelectorMapTests(unittest.TestCase):
    def test_selector_map_has_minimum_required_fields(self) -> None:
        selector_path = (
            Path(__file__)
            .resolve()
            .parents[1]
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
