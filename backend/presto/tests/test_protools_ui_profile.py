from __future__ import annotations

import sys
from pathlib import Path

project_root = Path(__file__).resolve().parents[2]
project_root_str = str(project_root)
if project_root_str not in sys.path:
    sys.path.insert(0, project_root_str)

from presto.integrations.mac import ProToolsUiProfile


def test_protools_ui_profile_keeps_strip_silence_surface_only() -> None:
    profile = ProToolsUiProfile()

    assert profile.strip_silence_window_name == "Strip Silence"
    assert profile.strip_silence_button_name == "Strip"
    assert not hasattr(profile, "build_apply_track_color_script")
    assert not hasattr(profile, "color_palette_item")
    assert not hasattr(profile, "selector_map")


def test_protools_ui_profile_builds_strip_silence_scripts() -> None:
    profile = ProToolsUiProfile()

    open_script = profile.build_open_strip_silence_script()
    execute_script = profile.build_execute_strip_silence_script()

    assert "Strip Silence" in open_script
    assert "Strip Silence" in execute_script
    assert "Strip" in execute_script


def test_protools_ui_profile_builds_delete_selected_track_script() -> None:
    profile = ProToolsUiProfile()

    script = profile.build_delete_selected_track_script()

    assert 'menu bar item "Track"' in script
    assert 'menu item "Delete..."' in script
    assert 'button "Delete"' in script


def test_protools_ui_profile_builds_set_track_pan_script() -> None:
    profile = ProToolsUiProfile()

    script = profile.build_set_track_pan_script("Kick", 0.0)

    assert 'first window whose name starts with "Edit:"' in script
    assert 'group "Audio IO"' in script
    assert 'first slider of ioGroup whose name starts with "Audio Pan indicator"' in script
    assert 'perform action "AXPress" of panSlider' in script
