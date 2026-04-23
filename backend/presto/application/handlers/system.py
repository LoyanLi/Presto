from __future__ import annotations

from typing import Any

from .common import read_connection_status
from ...domain.capabilities import DEFAULT_DAW_TARGET
from ...domain.ports import CapabilityExecutionContext


def system_health_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    _ = payload
    return {
        "backendReady": ctx.backend_ready,
        "activeDaw": ctx.target_daw or DEFAULT_DAW_TARGET,
    }


def daw_connection_get_status_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    _ = payload
    status = read_connection_status(ctx, "daw.connection.getStatus")
    connected = bool(getattr(status, "connected", False))
    return {
        "connected": connected,
        "targetDaw": ctx.target_daw or DEFAULT_DAW_TARGET,
        "sessionName": str(getattr(status, "session_name", "") or "") if connected else "",
    }
