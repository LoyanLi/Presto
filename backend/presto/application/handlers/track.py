from __future__ import annotations

from typing import Any

from .common import ensure_daw_connected
from .transport import map_track_info
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
    track_name = str(payload.get("trackName", ""))
    value = float(payload.get("value", 0.0))
    daw.set_track_pan(track_name, value)
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
