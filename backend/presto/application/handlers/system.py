from __future__ import annotations

from typing import Any

from .common import safe_connection_status
from ...domain.capabilities import DEFAULT_DAW_TARGET
from ...domain.ports import CapabilityExecutionContext


def system_health_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    _ = payload
    status = safe_connection_status(ctx)
    return {
        "backendReady": ctx.backend_ready,
        "dawConnected": bool(getattr(status, "connected", False)),
        "activeDaw": ctx.target_daw or DEFAULT_DAW_TARGET,
    }


def daw_connection_get_status_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    _ = payload
    status = safe_connection_status(ctx)
    return {
        "connected": bool(getattr(status, "connected", False)),
        "targetDaw": ctx.target_daw or DEFAULT_DAW_TARGET,
    }
