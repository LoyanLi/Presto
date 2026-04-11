from __future__ import annotations

from dataclasses import dataclass
import math


@dataclass(frozen=True)
class ProToolsUiProfile:
    daw_name: str = "pro_tools"
    process_name: str = "Pro Tools"
    window_menu_bar_item: str = "Window"
    track_menu_bar_item: str = "Track"
    strip_silence_window_name: str = "Strip Silence"
    strip_silence_button_name: str = "Strip"
    retryable_error_codes: tuple[str, ...] = (
        "UI_TIMEOUT",
        "UI_NOT_FRONTMOST",
        "UI_ELEMENT_NOT_FOUND",
        "UI_ACTION_FAILED",
    )

    def build_preflight_accessibility_script(self) -> str:
        process_name = self.process_name
        return f'''
            tell application "System Events"
                if not (exists process "{process_name}") then
                    error "Pro Tools process is not running." number 1001
                end if
                set frontmost of process "{process_name}" to true
                try
                    tell process "{process_name}"
                        set _menuBarName to name of menu bar 1
                        if not (exists menu bar item "{self.window_menu_bar_item}" of menu bar 1) then
                            error "Pro Tools UI must be set to English ({self.window_menu_bar_item} menu is required)." number 1003
                        end if
                    end tell
                on error errMsg
                    error "Accessibility permission is missing: " & errMsg number 1002
                end try
            end tell
        '''

    def build_open_strip_silence_script(self) -> str:
        process_name = self.process_name
        window_name = self.strip_silence_window_name
        return f'''
            tell application "System Events"
                tell process "{process_name}"
                    set frontmost to true
                    delay 0.1

                    set windowFound to (exists window "{window_name}")

                    if windowFound is false then
                        try
                            keystroke "u" using command down
                        end try
                        delay 0.1

                        repeat with waitAttempt from 1 to 12
                            if exists window "{window_name}" then
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

    def build_execute_strip_silence_script(self) -> str:
        process_name = self.process_name
        window_name = self.strip_silence_window_name
        strip_button_name = self.strip_silence_button_name
        return f'''
            tell application "System Events"
                tell process "{process_name}"
                    set frontmost to true
                    delay 0.1

                    set windowFound to (exists window "{window_name}")

                    if windowFound is false then
                        try
                            keystroke "u" using command down
                        end try
                        delay 0.1

                        repeat with waitAttempt from 1 to 12
                            if exists window "{window_name}" then
                                set windowFound to true
                                exit repeat
                            end if
                            delay 0.1
                        end repeat
                    end if

                    if windowFound is false then
                        error "Strip Silence window not found after shortcut attempts (Cmd+U)." number 1202
                    end if

                    tell window "{window_name}"
                        try
                            click button "{strip_button_name}"
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

                    set stripSilenceErrorMessage to ""
                    repeat with waitAttempt from 1 to 10
                        try
                            if exists sheet 1 of window 1 then
                                tell sheet 1 of window 1
                                    if exists button "OK" then
                                        try
                                            set stripSilenceErrorMessage to value of static text 1
                                        on error
                                            try
                                                set stripSilenceErrorMessage to name of static text 1
                                            on error
                                                set stripSilenceErrorMessage to "Unknown Strip Silence error."
                                            end try
                                        end try
                                        click button "OK"
                                        exit repeat
                                    end if
                                end tell
                            end if
                        end try

                        try
                            set dialogWindows to (every window whose subrole is "AXDialog")
                            repeat with dialogWindow in dialogWindows
                                if exists button "OK" of dialogWindow then
                                    try
                                        set stripSilenceErrorMessage to value of static text 1 of dialogWindow
                                    on error
                                        try
                                            set stripSilenceErrorMessage to name of static text 1 of dialogWindow
                                        on error
                                            set stripSilenceErrorMessage to "Unknown Strip Silence error."
                                        end try
                                    end try
                                    click button "OK" of dialogWindow
                                    exit repeat
                                end if
                            end repeat
                        end try

                        if stripSilenceErrorMessage is not "" then
                            exit repeat
                        end if

                        delay 0.1
                    end repeat

                    if stripSilenceErrorMessage contains "audio selection" then
                        error "Strip Silence failed: " & stripSilenceErrorMessage number 1204
                    end if

                    if stripSilenceErrorMessage is not "" then
                        error "Strip Silence failed: " & stripSilenceErrorMessage number 1204
                    end if
                end tell
            end tell
        '''

    def build_click_menu_item_script(self, *menu_path: str) -> str:
        normalized_path = [str(item).strip() for item in menu_path if str(item).strip()]
        if len(normalized_path) < 2:
            raise ValueError("menu_path_requires_at_least_two_items")

        quoted_path = ", ".join(f'"{item}"' for item in normalized_path)
        process_name = self.process_name
        return f'''
            tell application "System Events"
                tell process "{process_name}"
                    set frontmost to true
                    delay 0.1

                    set menuPath to {{{quoted_path}}}
                    set topItemName to item 1 of menuPath

                    if not (exists menu bar item topItemName of menu bar 1) then
                        error "Menu bar item not found: " & topItemName number 1301
                    end if

                    set currentMenu to menu 1 of menu bar item topItemName of menu bar 1

                    repeat with itemIndex from 2 to (count of menuPath)
                        set itemName to item itemIndex of menuPath
                        if itemIndex is equal to (count of menuPath) then
                            if not (exists menu item itemName of currentMenu) then
                                error "Menu item not found: " & itemName number 1302
                            end if
                            click menu item itemName of currentMenu
                        else
                            if not (exists menu item itemName of currentMenu) then
                                error "Menu item not found: " & itemName number 1302
                            end if
                            set currentMenu to menu 1 of menu item itemName of currentMenu
                        end if
                    end repeat
                end tell
            end tell
        '''

    def build_delete_selected_track_script(self) -> str:
        process_name = self.process_name
        track_menu_bar_item = self.track_menu_bar_item
        return f'''
            tell application "System Events"
                tell process "{process_name}"
                    set frontmost to true
                    delay 0.1

                    if not (exists menu bar item "{track_menu_bar_item}" of menu bar 1) then
                        error "Menu bar item not found: {track_menu_bar_item}" number 1301
                    end if

                    set trackMenu to menu 1 of menu bar item "{track_menu_bar_item}" of menu bar 1
                    if not (exists menu item "Delete..." of trackMenu) then
                        error "Menu item not found: Delete..." number 1302
                    end if

                    click menu item "Delete..." of trackMenu
                    delay 0.1

                    set deleteConfirmed to false

                    repeat with waitAttempt from 1 to 20
                        try
                            if exists sheet 1 of window 1 then
                                tell sheet 1 of window 1
                                    if exists button "Delete" then
                                        click button "Delete"
                                        set deleteConfirmed to true
                                        exit repeat
                                    end if
                                end tell
                            end if
                        end try

                        try
                            if exists window 1 then
                                tell window 1
                                    if exists button "Delete" then
                                        click button "Delete"
                                        set deleteConfirmed to true
                                        exit repeat
                                    end if
                                end tell
                            end if
                        end try

                        delay 0.05
                    end repeat

                    if deleteConfirmed is false then
                        error "Delete confirmation dialog not found." number 1303
                    end if
                end tell
            end tell
        '''

    def build_set_track_pan_script(self, track_name: str, pan: float) -> str:
        normalized_track_name = str(track_name).strip()
        if not normalized_track_name:
            raise ValueError("track_name_required")

        normalized_pan = float(pan)
        if not math.isfinite(normalized_pan) or normalized_pan < -1.0 or normalized_pan > 1.0:
            raise ValueError("track_pan_out_of_range")

        process_name = self.process_name
        escaped_track_name = normalized_track_name.replace('"', '\\"')
        return f'''
            tell application "System Events"
                tell process "{process_name}"
                    set frontmost to true
                    delay 0.1

                    set editWindow to first window whose name starts with "Edit:"
                    set trackGroup to first group of editWindow whose name contains "{escaped_track_name}" and name contains "Audio Track"
                    set ioGroup to group "Audio IO" of trackGroup
                    set panSlider to first slider of ioGroup whose name starts with "Audio Pan indicator"
                    perform action "AXPress" of panSlider
                end tell
            end tell
        '''
