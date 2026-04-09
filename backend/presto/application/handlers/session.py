from __future__ import annotations

from typing import Any

from .common import ensure_daw_connected
from .snapshot import get_snapshot_info_payload
from ...domain.ports import CapabilityExecutionContext


def session_get_info_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    daw = ensure_daw_connected(ctx, "session.getInfo", payload, raise_on_error=True)
    info = daw.get_session_info()
    return {
        "session": {
            "sessionName": info.session_name,
            "sessionPath": info.session_path,
            "sampleRate": info.sample_rate,
            "bitDepth": info.bit_depth,
            "isPlaying": bool(info.is_playing),
            "isRecording": bool(info.is_recording),
        }
    }


def session_get_length_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    daw = ensure_daw_connected(ctx, "session.getLength", payload, raise_on_error=True)
    return {"seconds": float(daw.get_session_length())}


def session_save_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    daw = ensure_daw_connected(ctx, "session.save", payload, raise_on_error=True)
    daw.save_session()
    return {"saved": True}


def session_get_snapshot_info_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    del ctx
    return get_snapshot_info_payload(payload)
