"""macOS AppleScript UI automation for Pro Tools operations."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

from presto.domain.errors import UiAutomationError
from presto.domain.models import SilenceProfile


class ProToolsUiAutomation:
    """Run deterministic AppleScript actions against Pro Tools UI."""

    def __init__(
        self,
        selector_map_path: Path | None = None,
        retry_count: int = 2,
        timeout_seconds: int = 10,
    ) -> None:
        if selector_map_path is None:
            selector_map_path = Path(__file__).with_name("selector_map_en_us.json")
        self.selector_map_path = selector_map_path
        self.retry_count = retry_count
        self.timeout_seconds = timeout_seconds
        self.selector_map = self._load_selector_map(selector_map_path)

    def preflight_accessibility(self) -> None:
        """Verify process visibility and accessibility permissions."""

        process_name = self.selector_map["pro_tools_process_name"]
        script = f'''
            tell application "System Events"
                if not (exists process "{process_name}") then
                    error "Pro Tools process is not running." number 1001
                end if
                set frontmost of process "{process_name}" to true
                try
                    tell process "{process_name}"
                        set _menuBarName to name of menu bar 1
                        if not (exists menu bar item "Window" of menu bar 1) then
                            error "Pro Tools UI must be set to English (Window menu is required)." number 1003
                        end if
                    end tell
                on error errMsg
                    error "Accessibility permission is missing: " & errMsg number 1002
                end try
            end tell
        '''
        self._run_script(script)

    def apply_track_color(self, slot: int, track_name: str) -> None:
        """Apply color slot to currently-selected track."""

        self._with_retry(
            lambda: self._apply_track_color_once(slot=slot, track_name=track_name),
            fallback_code="UI_ACTION_FAILED",
            fallback_message=f"Failed to apply track color for '{track_name}'.",
        )

    def strip_silence(self, track_name: str, profile: SilenceProfile) -> None:
        """Open Strip Silence and execute using current Pro Tools dialog values."""

        _ = profile
        self._with_retry(
            lambda: self._strip_silence_once(track_name=track_name),
            fallback_code="UI_ACTION_FAILED",
            fallback_message=f"Failed to run Strip Silence for '{track_name}'.",
        )

    def open_strip_silence_window(self) -> None:
        """Open Strip Silence window without executing Strip."""
        # Cmd+U is a toggle shortcut; retrying can close the dialog right after opening.
        self._open_strip_silence_window_once()

    def _apply_track_color_once(self, slot: int, track_name: str) -> None:
        menu_cfg = self.selector_map["menus"]["color_palette"]
        window_cfg = self.selector_map["windows"]["color_palette"]
        process_name = self.selector_map["pro_tools_process_name"]
        grid_cfg = window_cfg.get("swatch_grid", {})

        columns = int(grid_cfg.get("columns", 24))
        rows = int(grid_cfg.get("rows", 3))
        max_button_width = int(grid_cfg.get("fallback_button_max_width", 64))
        max_button_height = int(grid_cfg.get("fallback_button_max_height", 44))
        target_items = window_cfg.get("target_items", ["Tracks"])
        target_items_script = self._to_applescript_list(target_items)

        script = f'''
            tell application "System Events"
                tell process "{process_name}"
                    set frontmost to true
                    delay 0.1

                    click menu item "{menu_cfg["item"]}" of menu "{menu_cfg["menu"]}" of menu bar item "{menu_cfg["menu_bar_item"]}" of menu bar 1
                    delay 0.25

                    if not (exists window "{window_cfg["name"]}") then
                        error "Color Palette window not found." number 1102
                    end if

                    set windowRef to window "{window_cfg["name"]}"

                    try
                        set targetPopup to pop up button 1 of windowRef
                        click targetPopup
                        delay 0.1

                        set targetSelected to false
                        set targetCandidates to {target_items_script}
                        repeat with targetName in targetCandidates
                            if exists menu item (contents of targetName) of menu 1 of targetPopup then
                                click menu item (contents of targetName) of menu 1 of targetPopup
                                set targetSelected to true
                                exit repeat
                            end if
                        end repeat

                        if targetSelected is false then
                            try
                                set popupItems to menu items of menu 1 of targetPopup
                                repeat with popupItem in popupItems
                                    set popupName to name of popupItem
                                    if popupName contains "Track" and popupName does not contain "Clip" then
                                        click popupItem
                                        set targetSelected to true
                                        exit repeat
                                    end if
                                end repeat
                            end try
                        end if

                        if targetSelected is false then
                            key code 53
                        end if
                    end try

                    if {slot} < 1 then
                        error "Invalid color slot." number 1103
                    end if

                    set totalSlots to ({columns} * {rows})
                    if totalSlots < 1 then
                        error "Invalid swatch grid config." number 1105
                    end if

                    set mappedIndex to ({slot} - 1) mod totalSlots
                    set targetCol to mappedIndex mod {columns}
                    set targetRow to mappedIndex div {columns}

                    set swatchButtons to (every button of windowRef whose ((item 1 of size) <= {max_button_width} and (item 2 of size) <= {max_button_height}))
                    set swatchCount to count of swatchButtons
                    if swatchCount < 1 then
                        error "No selectable color swatches found." number 1104
                    end if

                    set minX to 999999
                    set minY to 999999
                    set maxX to -1
                    set maxY to -1

                    repeat with btnRef in swatchButtons
                        set btnPos to position of btnRef
                        set btnSize to size of btnRef
                        set btnLeft to item 1 of btnPos
                        set btnTop to item 2 of btnPos
                        set btnRight to btnLeft + (item 1 of btnSize)
                        set btnBottom to btnTop + (item 2 of btnSize)

                        if btnLeft < minX then set minX to btnLeft
                        if btnTop < minY then set minY to btnTop
                        if btnRight > maxX then set maxX to btnRight
                        if btnBottom > maxY then set maxY to btnBottom
                    end repeat

                    if maxX <= minX or maxY <= minY then
                        error "Invalid color swatch bounds." number 1106
                    end if

                    set cellW to (maxX - minX) / {columns}
                    set cellH to (maxY - minY) / {rows}
                    if cellW <= 0 or cellH <= 0 then
                        error "Invalid color cell size." number 1107
                    end if

                    set targetX to minX + ((targetCol + 0.5) * cellW)
                    set targetY to minY + ((targetRow + 0.5) * cellH)

                    set bestButton to item 1 of swatchButtons
                    set bestDistance to 9.9E+20

                    repeat with btnRef in swatchButtons
                        set btnPos to position of btnRef
                        set btnSize to size of btnRef
                        set centerX to (item 1 of btnPos) + ((item 1 of btnSize) / 2)
                        set centerY to (item 2 of btnPos) + ((item 2 of btnSize) / 2)

                        set dx to centerX - targetX
                        set dy to centerY - targetY
                        set distanceScore to (dx * dx) + (dy * dy)

                        if distanceScore < bestDistance then
                            set bestDistance to distanceScore
                            set bestButton to btnRef
                        end if
                    end repeat

                    click bestButton
                end tell
            end tell
        '''
        self._run_script(script)

    def _strip_silence_once(self, track_name: str) -> None:
        _ = track_name
        self._open_strip_silence_window_once()

        window_cfg = self.selector_map["windows"]["strip_silence"]
        process_name = self.selector_map["pro_tools_process_name"]
        strip_script = f'''
            tell application "System Events"
                tell process "{process_name}"
                    tell window "{window_cfg["name"]}"
                        try
                            click button "{window_cfg["strip_button"]}"
                        on error
                            try
                                set stripButtons to (every button whose name contains "Strip")
                                if (count of stripButtons) > 0 then
                                    click item 1 of stripButtons
                                else
                                    click button 1
                                end if
                            on error
                                key code 36
                            end try
                        end try
                    end tell
                end tell
            end tell
        '''
        self._run_script(strip_script)

    def _open_strip_silence_window_once(self) -> None:
        window_cfg = self.selector_map["windows"]["strip_silence"]
        process_name = self.selector_map["pro_tools_process_name"]
        open_script = f'''
            tell application "System Events"
                tell process "{process_name}"
                    set frontmost to true
                    delay 0.1

                    set windowFound to (exists window "{window_cfg["name"]}")

                    if windowFound is false then
                        try
                            keystroke "u" using command down
                        end try
                        delay 0.1

                        repeat with waitAttempt from 1 to 12
                            if exists window "{window_cfg["name"]}" then
                                set windowFound to true
                                exit repeat
                            end if
                            delay 0.1
                        end repeat
                    end if

                    if windowFound is false then
                        error "Strip Silence window not found after shortcut attempts (Cmd+U)." number 1202
                    end if
                end tell
            end tell
        '''
        self._run_script(open_script)

    def _with_retry(self, action, fallback_code: str, fallback_message: str) -> None:
        last_error: UiAutomationError | None = None
        for _ in range(self.retry_count):
            try:
                action()
                return
            except UiAutomationError as exc:
                last_error = exc

        if last_error is not None:
            raise last_error
        raise UiAutomationError(fallback_code, fallback_message)

    def _run_script(self, script: str) -> str:
        try:
            proc = subprocess.run(
                ["osascript", "-e", script],
                check=True,
                text=True,
                capture_output=True,
                timeout=self.timeout_seconds,
            )
            return proc.stdout.strip()
        except subprocess.TimeoutExpired as exc:
            raise UiAutomationError("UI_TIMEOUT", "UI automation command timed out.") from exc
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip()
            message = stderr or "AppleScript execution failed."
            lowered = message.lower()

            if "frontmost" in lowered:
                code = "UI_NOT_FRONTMOST"
            elif (
                "not found" in lowered
                or "can't get" in lowered
                or "can’t get" in lowered
                or "invalid index" in lowered
            ):
                code = "UI_ELEMENT_NOT_FOUND"
            else:
                code = "UI_ACTION_FAILED"

            raise UiAutomationError(code, message) from exc

    @staticmethod
    def _load_selector_map(path: Path) -> dict:
        with path.open("r", encoding="utf-8") as fp:
            return json.load(fp)

    @staticmethod
    def _to_applescript_list(values: list[str]) -> str:
        escaped = [value.replace("\\", "\\\\").replace('"', '\\"') for value in values]
        inner = ", ".join(f'"{value}"' for value in escaped)
        return "{" + inner + "}"
