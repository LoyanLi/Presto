from __future__ import annotations

from typing import Any

from .common import ensure_daw_connected, validation_error
from ...domain.errors import PrestoError
from ...domain.ports import CapabilityExecutionContext
from ...integrations.mac import MacAutomationError


def get_mac_automation(ctx: CapabilityExecutionContext, capability_id: str) -> Any:
    mac_automation = ctx.mac_automation
    if mac_automation is None:
        raise PrestoError(
            "MAC_AUTOMATION_UNAVAILABLE",
            "Mac automation engine is not configured.",
            source="runtime",
            retryable=False,
            capability=capability_id,
            details={
                "rawCode": "MAC_AUTOMATION_UNAVAILABLE",
                "rawMessage": "Mac automation engine is not configured.",
            },
        )
    return mac_automation


def get_daw_ui_profile(ctx: CapabilityExecutionContext, capability_id: str) -> Any:
    daw_ui_profile = ctx.daw_ui_profile
    if daw_ui_profile is None:
        raise PrestoError(
            "DAW_UI_PROFILE_UNAVAILABLE",
            "DAW UI profile is not configured.",
            source="runtime",
            retryable=False,
            capability=capability_id,
            details={
                "rawCode": "DAW_UI_PROFILE_UNAVAILABLE",
                "rawMessage": "DAW UI profile is not configured.",
            },
        )
    return daw_ui_profile


def strip_silence_runtime_error(
    exc: Exception,
    *,
    capability: str,
    fallback_message: str,
) -> PrestoError:
    if isinstance(exc, MacAutomationError):
        raw_code = str(exc.code or "UI_ACTION_FAILED")
        raw_message = str(exc.raw_message or exc.message or fallback_message)
        message = str(exc.message or fallback_message)
        retryable = bool(exc.retryable)
        details = dict(exc.details or {})
    else:
        raw_code = "UI_ACTION_FAILED"
        raw_message = str(exc) or fallback_message
        message = raw_message
        retryable = False
        details = {"rawException": exc.__class__.__name__}

    return PrestoError(
        raw_code,
        message,
        source="runtime",
        retryable=retryable,
        details={
            "rawCode": raw_code,
            "rawMessage": raw_message,
            **details,
        },
        capability=capability,
        adapter="pro_tools",
    )


def _open_strip_silence_payload(
    ctx: CapabilityExecutionContext,
    payload: dict[str, Any],
    *,
    capability_id: str,
) -> dict[str, Any]:
    del payload
    mac_automation = get_mac_automation(ctx, capability_id)
    daw_ui_profile = get_daw_ui_profile(ctx, capability_id)

    try:
        mac_automation.run_script(daw_ui_profile.build_preflight_accessibility_script())
        mac_automation.run_script(daw_ui_profile.build_open_strip_silence_script())
    except Exception as exc:
        raise strip_silence_runtime_error(
            exc,
            capability=capability_id,
            fallback_message="Failed to open Strip Silence.",
        ) from exc

    return {"opened": True}


def open_strip_silence_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return _open_strip_silence_payload(ctx, payload, capability_id="daw.stripSilence.open")


def open_strip_silence_via_ui_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return _open_strip_silence_payload(ctx, payload, capability_id="daw.stripSilence.openViaUi")


def _execute_strip_silence_payload(
    ctx: CapabilityExecutionContext,
    payload: dict[str, Any],
    *,
    capability_id: str,
) -> dict[str, Any]:
    mac_automation = get_mac_automation(ctx, capability_id)
    daw_ui_profile = get_daw_ui_profile(ctx, capability_id)

    track_name = str(payload.get("trackName", "")).strip()
    if not track_name:
        raise validation_error("trackName is required.", field="trackName", capability=capability_id)

    try:
        mac_automation.run_script(daw_ui_profile.build_preflight_accessibility_script())
        mac_automation.run_script(daw_ui_profile.build_execute_strip_silence_script())
    except Exception as exc:
        raise strip_silence_runtime_error(
            exc,
            capability=capability_id,
            fallback_message=f"Failed to run Strip Silence for '{track_name}'.",
        ) from exc

    return {"completed": True}


def execute_strip_silence_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return _execute_strip_silence_payload(ctx, payload, capability_id="daw.stripSilence.execute")


def execute_strip_silence_via_ui_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return _execute_strip_silence_payload(ctx, payload, capability_id="daw.stripSilence.executeViaUi")


def automation_runtime_error(
    exc: Exception,
    *,
    capability: str,
    fallback_message: str,
) -> PrestoError:
    if isinstance(exc, MacAutomationError):
        raw_code = str(exc.code or "UI_ACTION_FAILED")
        raw_message = str(exc.raw_message or exc.message or fallback_message)
        message = str(exc.message or fallback_message)
        retryable = bool(exc.retryable)
        details = dict(exc.details or {})
    else:
        raw_code = "UI_ACTION_FAILED"
        raw_message = str(exc) or fallback_message
        message = raw_message
        retryable = False
        details = {"rawException": exc.__class__.__name__}

    return PrestoError(
        raw_code,
        message,
        source="runtime",
        retryable=retryable,
        details={
            "rawCode": raw_code,
            "rawMessage": raw_message,
            **details,
        },
        capability=capability,
        adapter="pro_tools",
    )


def track_selection_invalid_error(
    capability_id: str,
    message: str,
    *,
    selected_track_names: list[str],
) -> PrestoError:
    return PrestoError(
        "TRACK_SELECTION_INVALID",
        message,
        source="capability",
        retryable=False,
        capability=capability_id,
        adapter="pro_tools",
        details={
            "rawCode": "TRACK_SELECTION_INVALID",
            "rawMessage": message,
            "selectedTrackNames": selected_track_names,
            "selectionCount": len(selected_track_names),
        },
        status_code=400,
    )


def strip_mono_channel_suffix(track_name: str) -> str:
    normalized = str(track_name).strip()
    for suffix in (".L", ".Left", " L", " Left", ".R", ".Right", " R", " Right"):
        if normalized.endswith(suffix):
            candidate = normalized[: -len(suffix)].strip()
            if candidate:
                return candidate
    return normalized


def resolve_split_mono_tracks(
    before_tracks: list[Any],
    after_tracks: list[Any],
    source_track_name: str,
) -> tuple[str, str]:
    before_names = {str(getattr(track, "track_name", "")) for track in before_tracks}
    new_tracks = [
        track for track in after_tracks
        if str(getattr(track, "track_name", "")) not in before_names
        and str(getattr(track, "track_format", "unknown")) == "mono"
    ]

    left_name = ""
    right_name = ""
    for track in new_tracks:
        track_name = str(getattr(track, "track_name", "")).strip()
        if not track_name:
            continue
        if track_name == f"{source_track_name}.L" or track_name.startswith(f"{source_track_name}.") and track_name.endswith(".L"):
            left_name = track_name
        if track_name == f"{source_track_name}.R" or track_name.startswith(f"{source_track_name}.") and track_name.endswith(".R"):
            right_name = track_name

    if not left_name or not right_name:
        raise PrestoError(
            "AUTOMATION_TRACK_DISCOVERY_FAILED",
            "Failed to identify split mono tracks after running automation.",
            source="runtime",
            retryable=False,
            capability="daw.automation.splitStereoToMono.execute",
            adapter="pro_tools",
            details={
                "rawCode": "AUTOMATION_TRACK_DISCOVERY_FAILED",
                "rawMessage": "Failed to identify split mono tracks after running automation.",
                "sourceTrackName": source_track_name,
                "beforeTrackNames": sorted(before_names),
                "afterTrackNames": [str(getattr(track, "track_name", "")) for track in after_tracks],
            },
        )

    return left_name, right_name


def split_stereo_to_mono_execute_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    keep_channel = str(payload.get("keepChannel", "left")).strip().lower()
    if keep_channel not in {"left", "right"}:
        raise validation_error(
            "keepChannel must be either left or right.",
            field="keepChannel",
            capability="daw.automation.splitStereoToMono.execute",
        )

    capability_id = "daw.automation.splitStereoToMono.execute"
    daw = ensure_daw_connected(ctx, capability_id, {}, raise_on_error=True)
    mac_automation = get_mac_automation(ctx, capability_id)
    daw_ui_profile = get_daw_ui_profile(ctx, capability_id)

    selected_track_names_getter = getattr(daw, "get_selected_track_names", None)
    if not callable(selected_track_names_getter):
        raise PrestoError(
            "TRACK_SELECTION_UNAVAILABLE",
            "Current DAW adapter cannot inspect selected tracks.",
            source="runtime",
            retryable=False,
            capability=capability_id,
            adapter="pro_tools",
            details={
                "rawCode": "TRACK_SELECTION_UNAVAILABLE",
                "rawMessage": "Current DAW adapter cannot inspect selected tracks.",
            },
        )

    selected_track_names = [str(name).strip() for name in selected_track_names_getter() if str(name).strip()]
    if not selected_track_names:
        raise track_selection_invalid_error(
            capability_id,
            "At least one stereo track must be selected in Pro Tools before running this automation.",
            selected_track_names=selected_track_names,
        )

    before_tracks = daw.list_tracks()
    source_tracks = []
    for source_track_name in selected_track_names:
        source_track = next((track for track in before_tracks if str(getattr(track, "track_name", "")) == source_track_name), None)
        source_tracks.append(source_track)

    if any(
        source_track is None or str(getattr(source_track, "track_format", "unknown")) != "stereo"
        for source_track in source_tracks
    ):
        raise track_selection_invalid_error(
            capability_id,
            "All selected Pro Tools tracks must be stereo tracks.",
            selected_track_names=selected_track_names,
        )

    try:
        mac_automation.run_script(daw_ui_profile.build_preflight_accessibility_script())
        mac_automation.run_script(daw_ui_profile.build_click_menu_item_script("Track", "Split into Mono"))
    except Exception as exc:
        raise automation_runtime_error(
            exc,
            capability=capability_id,
            fallback_message="Failed to split the selected stereo tracks into mono.",
        ) from exc

    after_split_tracks = daw.list_tracks()
    resolved_items: list[dict[str, Any]] = []
    discarded_track_names: list[str] = []
    for source_track_name in selected_track_names:
        left_track_name, right_track_name = resolve_split_mono_tracks(before_tracks, after_split_tracks, source_track_name)
        kept_original_name = left_track_name if keep_channel == "left" else right_track_name
        discarded_track_name = right_track_name if keep_channel == "left" else left_track_name
        kept_track_name = strip_mono_channel_suffix(kept_original_name)
        resolved_items.append(
            {
                "sourceTrackName": source_track_name,
                "leftTrackName": left_track_name,
                "rightTrackName": right_track_name,
                "keptOriginalName": kept_original_name,
                "keptTrackName": kept_track_name,
                "deletedTrackNames": [source_track_name, discarded_track_name],
            }
        )
        discarded_track_names.append(discarded_track_name)

    try:
        select_tracks = getattr(daw, "select_tracks", None)
        delete_track_names = [*selected_track_names, *discarded_track_names]
        if callable(select_tracks):
            select_tracks(delete_track_names)
        else:
            for track_name in delete_track_names:
                daw.select_track(track_name)
        mac_automation.run_script(daw_ui_profile.build_delete_selected_track_script())
    except Exception as exc:
        raise automation_runtime_error(
            exc,
            capability=capability_id,
            fallback_message="Failed to delete redundant tracks for the selected stereo tracks.",
        ) from exc

    for item in resolved_items:
        daw.rename_track(str(item["keptOriginalName"]), str(item["keptTrackName"]))
        try:
            daw.select_track(str(item["keptTrackName"]))
            mac_automation.run_script(daw_ui_profile.build_set_track_pan_script(str(item["keptTrackName"]), 0.0))
        except Exception as exc:
            raise automation_runtime_error(
                exc,
                capability=capability_id,
                fallback_message=f"Failed to reset pan for '{item['keptTrackName']}'.",
            ) from exc

    return {
        "completed": True,
        "items": [
            {
                "sourceTrackName": str(item["sourceTrackName"]),
                "keptTrackName": str(item["keptTrackName"]),
                "deletedTrackNames": [str(name) for name in item["deletedTrackNames"]],
            }
            for item in resolved_items
        ],
    }
