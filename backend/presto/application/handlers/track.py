from __future__ import annotations

from typing import Any

from .common import ensure_daw_connected
from .automation import automation_runtime_error, get_daw_ui_profile, get_mac_automation
from .transport import map_track_info
from ...domain.errors import PrestoError
from ...domain.ports import CapabilityExecutionContext


def _batch_track_toggle_payload(
    ctx: CapabilityExecutionContext,
    payload: dict[str, Any],
    *,
    capability_id: str,
    method_name: str,
) -> dict[str, Any]:
    daw = ensure_daw_connected(ctx, capability_id, payload, raise_on_error=True)
    track_names = [str(name) for name in payload.get("trackNames", []) if str(name).strip()]
    enabled = bool(payload.get("enabled"))
    getattr(daw, method_name)(track_names, enabled)
    return {
        "updated": True,
        "trackNames": track_names,
        "enabled": enabled,
    }


def track_list_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "daw.track.list"
    daw = ensure_daw_connected(ctx, capability_id, payload, raise_on_error=True)
    tracks = daw.list_tracks()
    return {
        "tracks": [map_track_info(track) for track in tracks],
    }


def track_list_names_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "daw.track.listNames"
    daw = ensure_daw_connected(ctx, capability_id, payload, raise_on_error=True)
    names = daw.list_track_names()
    return {
        "names": [str(name) for name in names],
    }


def track_select_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "daw.track.select"
    daw = ensure_daw_connected(ctx, capability_id, payload, raise_on_error=True)
    track_names = [str(name) for name in payload.get("trackNames", []) if str(name).strip()]
    if track_names:
        daw.select_tracks(track_names)
    else:
        daw.select_track(str(payload.get("trackName", "")))
    return {
        "selected": True,
    }


def track_selection_get_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "daw.track.selection.get"
    daw = ensure_daw_connected(ctx, capability_id, payload, raise_on_error=True)
    names = daw.get_selected_track_names()
    return {
        "trackNames": [str(name) for name in names if str(name).strip()],
    }


def track_color_apply_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "daw.track.color.apply"
    daw = ensure_daw_connected(ctx, capability_id, payload, raise_on_error=True)
    track_name = str(payload.get("trackName", ""))
    color_slot = payload.get("colorSlot")
    daw.apply_track_color(track_name, color_slot)
    return {
        "applied": True,
        "trackName": track_name,
        "colorSlot": int(color_slot),
    }


def track_pan_set_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "daw.track.pan.set"
    daw = ensure_daw_connected(ctx, capability_id, payload, raise_on_error=True)
    mac_automation = get_mac_automation(ctx, capability_id)
    daw_ui_profile = get_daw_ui_profile(ctx, capability_id)
    track_name = str(payload.get("trackName", "")).strip()
    try:
        value = float(payload.get("value", 0.0))
    except Exception as exc:
        raise PrestoError(
            "TRACK_PAN_VALUE_INVALID",
            "Track pan value must be a number between -1.0 and 1.0.",
            source="capability",
            retryable=False,
            capability=capability_id,
            adapter="pro_tools",
            details={
                "rawCode": "TRACK_PAN_VALUE_INVALID",
                "rawMessage": "Track pan value must be a number between -1.0 and 1.0.",
                "trackName": track_name,
                "value": payload.get("value"),
            },
            status_code=400,
        ) from exc
    if value < -1.0 or value > 1.0:
        raise PrestoError(
            "TRACK_PAN_VALUE_INVALID",
            "Track pan value must be between -1.0 and 1.0.",
            source="capability",
            retryable=False,
            capability=capability_id,
            adapter="pro_tools",
            details={
                "rawCode": "TRACK_PAN_VALUE_INVALID",
                "rawMessage": "Track pan value must be between -1.0 and 1.0.",
                "trackName": track_name,
                "value": value,
            },
            status_code=400,
        )

    try:
        daw.select_track(track_name)
        mac_automation.run_script(daw_ui_profile.build_preflight_accessibility_script())
        mac_automation.run_script(daw_ui_profile.build_set_track_pan_script(track_name, value))
    except Exception as exc:
        raise automation_runtime_error(
            exc,
            capability=capability_id,
            fallback_message=f"Failed to set pan for '{track_name}'.",
        ) from exc
    return {
        "updated": True,
        "trackName": track_name,
        "value": value,
    }


def track_rename_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "daw.track.rename"
    daw = ensure_daw_connected(ctx, capability_id, payload, raise_on_error=True)
    current_name = str(payload.get("currentName", ""))
    new_name = str(payload.get("newName", ""))
    daw.rename_track(current_name, new_name)
    return {
        "renamed": True,
        "trackName": new_name,
    }


def track_mute_set_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return _batch_track_toggle_payload(
        ctx,
        payload,
        capability_id="daw.track.mute.set",
        method_name="set_track_mute_state_batch",
    )


def track_solo_set_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return _batch_track_toggle_payload(
        ctx,
        payload,
        capability_id="daw.track.solo.set",
        method_name="set_track_solo_state_batch",
    )


def track_hidden_set_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return _batch_track_toggle_payload(
        ctx,
        payload,
        capability_id="daw.track.hidden.set",
        method_name="set_track_hidden_state_batch",
    )


def track_inactive_set_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return _batch_track_toggle_payload(
        ctx,
        payload,
        capability_id="daw.track.inactive.set",
        method_name="set_track_inactive_state_batch",
    )


def track_record_enable_set_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return _batch_track_toggle_payload(
        ctx,
        payload,
        capability_id="daw.track.recordEnable.set",
        method_name="set_track_record_enable_state_batch",
    )


def track_record_safe_set_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return _batch_track_toggle_payload(
        ctx,
        payload,
        capability_id="daw.track.recordSafe.set",
        method_name="set_track_record_safe_state_batch",
    )


def track_input_monitor_set_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return _batch_track_toggle_payload(
        ctx,
        payload,
        capability_id="daw.track.inputMonitor.set",
        method_name="set_track_input_monitor_state_batch",
    )


def track_online_set_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return _batch_track_toggle_payload(
        ctx,
        payload,
        capability_id="daw.track.online.set",
        method_name="set_track_online_state_batch",
    )


def track_frozen_set_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return _batch_track_toggle_payload(
        ctx,
        payload,
        capability_id="daw.track.frozen.set",
        method_name="set_track_frozen_state_batch",
    )


def track_open_set_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return _batch_track_toggle_payload(
        ctx,
        payload,
        capability_id="daw.track.open.set",
        method_name="set_track_open_state_batch",
    )
