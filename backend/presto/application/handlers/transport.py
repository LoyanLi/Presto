from __future__ import annotations

from typing import Any

from .common import ensure_daw_connected, get_daw, validation_error
from ...domain.ports import CapabilityExecutionContext


def split_address(address: str) -> tuple[str, int]:
    host, _, port_text = address.rpartition(":")
    if host and port_text.isdigit():
        return host, int(port_text)
    return address, 31416


def connect_daw_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    daw = get_daw(ctx, "daw.connection.connect")
    host = payload.get("host")
    port = payload.get("port")
    timeout_seconds = payload.get("timeoutSeconds")
    connected = daw.connect(host=host, port=port, timeout_seconds=timeout_seconds)
    address = getattr(daw, "address", "") or ""
    resolved_host, resolved_port = split_address(str(address))
    if host is not None:
        resolved_host = str(host)
    if port is not None:
        resolved_port = int(port)
    return {"connected": bool(connected), "host": resolved_host, "port": resolved_port}


def disconnect_daw_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    del payload
    daw = get_daw(ctx, "daw.connection.disconnect")
    daw.disconnect()
    return {"disconnected": True}


def transport_status_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    daw = ensure_daw_connected(ctx, "daw.transport.getStatus", payload, raise_on_error=True)
    status = daw.get_transport_status()
    return {
        "transport": {
            "state": getattr(status, "state", "stopped"),
            "isPlaying": bool(getattr(status, "is_playing", False)),
            "isRecording": bool(getattr(status, "is_recording", False)),
        }
    }


def play_transport_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    daw = ensure_daw_connected(ctx, "daw.transport.play", payload, raise_on_error=True)
    daw.play()
    return {"started": True}


def stop_transport_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    daw = ensure_daw_connected(ctx, "daw.transport.stop", payload, raise_on_error=True)
    daw.stop()
    return {"stopped": True}


def record_transport_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    daw = ensure_daw_connected(ctx, "daw.transport.record", payload, raise_on_error=True)
    daw.record()
    return {"recording": True}


def export_range_set_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "daw.export.range.set"
    daw = ensure_daw_connected(ctx, capability_id, payload, raise_on_error=True)
    in_time = str(payload.get("inTime", "")).strip()
    out_time = str(payload.get("outTime", "")).strip()
    if not in_time:
        raise validation_error("inTime is required.", field="inTime", capability=capability_id)
    if not out_time:
        raise validation_error("outTime is required.", field="outTime", capability=capability_id)
    selection = daw.set_timeline_selection(in_time=in_time, out_time=out_time)
    return {"selection": {"inTime": selection[0], "outTime": selection[1]}}


def export_mix_with_source_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "daw.export.mixWithSource"
    daw = ensure_daw_connected(ctx, capability_id, payload, raise_on_error=True)
    source_type = str(payload.get("sourceType") or payload.get("source_type") or "").strip()
    if not source_type:
        raise validation_error("sourceType is required.", field="sourceType", capability=capability_id)
    return {
        "sourceType": source_type,
        "sourceList": daw.list_export_mix_sources(source_type),
    }


def map_track_info(track: Any) -> dict[str, Any]:
    return {
        "id": getattr(track, "track_id", ""),
        "name": getattr(track, "track_name", ""),
        "type": getattr(track, "track_type", "audio"),
        "format": getattr(track, "track_format", "unknown"),
        "isMuted": bool(getattr(track, "is_muted", False)),
        "isSoloed": bool(getattr(track, "is_soloed", False)),
        "isRecordEnabled": False,
        "color": getattr(track, "color", None),
        "comments": None,
    }
