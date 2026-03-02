from __future__ import annotations

import unittest

from presto.domain.pt_color_palette import (
    PT_COLOR_HEX,
    PT_COLOR_SLOT_MAX,
    clamp_color_slot,
    palette_hex_for_slot,
)


class PtColorPaletteTests(unittest.TestCase):
    def test_slot_bounds(self) -> None:
        self.assertEqual(clamp_color_slot(-10), 1)
        self.assertEqual(clamp_color_slot(1), 1)
        self.assertEqual(clamp_color_slot(PT_COLOR_SLOT_MAX + 100), PT_COLOR_SLOT_MAX)

    def test_palette_hex_for_slot(self) -> None:
        self.assertEqual(palette_hex_for_slot(1), PT_COLOR_HEX[0])
        self.assertEqual(palette_hex_for_slot(PT_COLOR_SLOT_MAX), PT_COLOR_HEX[-1])

    def test_palette_size(self) -> None:
        self.assertEqual(len(PT_COLOR_HEX), PT_COLOR_SLOT_MAX)


if __name__ == "__main__":
    unittest.main()
