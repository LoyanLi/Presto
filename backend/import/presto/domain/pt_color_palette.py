"""Pro Tools palette helpers used by UI preview and automation validation."""

from __future__ import annotations

import colorsys

PT_COLOR_COLUMNS = 24
PT_COLOR_ROWS = 3
PT_COLOR_SLOT_MAX = PT_COLOR_COLUMNS * PT_COLOR_ROWS


def _hsl_to_hex(h: float, s: float, l: float) -> str:
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return f"#{int(round(r * 255)):02X}{int(round(g * 255)):02X}{int(round(b * 255)):02X}"


def _build_palette() -> list[str]:
    # Approximate built-in Pro Tools color palette order: purple -> red -> yellow -> green -> cyan -> blue.
    hue_degrees = [
        242,
        252,
        262,
        272,
        284,
        298,
        314,
        332,
        0,
        10,
        22,
        40,
        58,
        76,
        94,
        108,
        120,
        136,
        152,
        168,
        186,
        202,
        218,
        232,
    ]
    # Top to bottom rows in Color Palette are lighter to darker.
    row_lightness = [0.54, 0.37, 0.23]
    row_saturation = [0.72, 0.69, 0.66]

    palette: list[str] = []
    for row in range(PT_COLOR_ROWS):
        for degree in hue_degrees:
            palette.append(
                _hsl_to_hex(
                    h=(degree % 360) / 360.0,
                    s=row_saturation[row],
                    l=row_lightness[row],
                )
            )
    return palette


PT_COLOR_HEX: list[str] = _build_palette()


def clamp_color_slot(slot: int) -> int:
    """Clamp slot into valid Pro Tools palette bounds."""

    return max(1, min(PT_COLOR_SLOT_MAX, int(slot)))


def palette_hex_for_slot(slot: int) -> str:
    """Return preview hex for a palette slot (1-based)."""

    normalized = clamp_color_slot(slot)
    return PT_COLOR_HEX[normalized - 1]

