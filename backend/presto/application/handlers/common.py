from __future__ import annotations

from typing import Any

from ..service_container import ServiceContainer
from ...domain.errors import PrestoError, PrestoValidationError


def validation_error(message: str, *, field: str, capability: str) -> PrestoValidationError:
    return PrestoValidationError(
        message,
        capability=capability,
        details={
            "rawCode": "VALIDATION_ERROR",
            "rawMessage": message,
            "field": field,
        },
    )


def get_daw(services: ServiceContainer, capability_id: str) -> Any:
    if services.daw is None:
        raise PrestoError(
            "DAW_UNAVAILABLE",
            "DAW adapter is not configured.",
            source="runtime",
            retryable=False,
            capability=capability_id,
            adapter=str(services.target_daw),
            details={
                "rawCode": "DAW_UNAVAILABLE",
                "rawMessage": "DAW adapter is not configured.",
            },
        )
    return services.daw


def ensure_daw_connected(
    services: ServiceContainer,
    capability_id: str,
    payload: dict[str, Any],
    *,
    raise_on_error: bool,
) -> Any:
    daw = get_daw(services, capability_id)
    is_connected = getattr(daw, "is_connected", None)
    already_connected = bool(is_connected()) if callable(is_connected) else False
    if already_connected:
        return daw

    connect = getattr(daw, "connect", None)
    if not callable(connect):
        return daw

    host = payload.get("host") if isinstance(payload, dict) else None
    port = payload.get("port") if isinstance(payload, dict) else None
    timeout_seconds = payload.get("timeoutSeconds") if isinstance(payload, dict) else None

    try:
        connect(host=host, port=port, timeout_seconds=timeout_seconds)
    except Exception:
        if raise_on_error:
            raise

    return daw


def safe_connection_status(services: ServiceContainer) -> Any | None:
    daw = services.daw
    if daw is None:
        return None

    get_connection_status = getattr(daw, "get_connection_status", None)
    if not callable(get_connection_status):
        return None

    try:
        return get_connection_status()
    except Exception:
        return None
