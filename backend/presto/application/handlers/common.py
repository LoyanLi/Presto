from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ...domain.errors import PrestoError, PrestoValidationError
from ...domain.jobs import JobManagerProtocol
from ...domain.ports import (
    CapabilityExecutionContext,
    ConfigStorePort,
    DawAdapterPort,
    DawUiProfilePort,
    ErrorNormalizerPort,
    ImportAnalysisStorePort,
    JobHandleRegistryPort,
    KeychainStorePort,
    LoggerPort,
    MacAutomationPort,
)


@dataclass(frozen=True)
class HandlerRuntime:
    error_normalizer: ErrorNormalizerPort
    target_daw: str
    job_manager: JobManagerProtocol
    import_analysis_store: ImportAnalysisStorePort
    job_handle_registry: JobHandleRegistryPort
    daw: DawAdapterPort | None
    mac_automation: MacAutomationPort | None
    daw_ui_profile: DawUiProfilePort | None
    config_store: ConfigStorePort | None
    keychain_store: KeychainStorePort | None
    logger: LoggerPort | None


def runtime_from_context(ctx: CapabilityExecutionContext) -> HandlerRuntime:
    return HandlerRuntime(
        error_normalizer=ctx.error_normalizer,
        target_daw=str(ctx.target_daw),
        job_manager=ctx.jobs,
        import_analysis_store=ctx.import_analysis_store,
        job_handle_registry=ctx.job_handle_registry,
        daw=ctx.daw,
        mac_automation=ctx.mac_automation,
        daw_ui_profile=ctx.daw_ui_profile,
        config_store=ctx.config_store,
        keychain_store=ctx.keychain_store,
        logger=ctx.logger,
    )


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


def get_daw(ctx: CapabilityExecutionContext, capability_id: str) -> Any:
    if ctx.daw is None:
        raise PrestoError(
            "DAW_UNAVAILABLE",
            "DAW adapter is not configured.",
            source="runtime",
            retryable=False,
            capability=capability_id,
            adapter=str(ctx.target_daw),
            details={
                "rawCode": "DAW_UNAVAILABLE",
                "rawMessage": "DAW adapter is not configured.",
            },
        )
    return ctx.daw


def ensure_daw_connected(
    ctx: CapabilityExecutionContext,
    capability_id: str,
    payload: dict[str, Any],
    *,
    raise_on_error: bool,
) -> Any:
    daw = get_daw(ctx, capability_id)
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


def read_connection_status(ctx: CapabilityExecutionContext, capability_id: str) -> Any:
    daw = get_daw(ctx, capability_id)
    get_connection_status = getattr(daw, "get_connection_status", None)
    if not callable(get_connection_status):
        raise PrestoError(
            "DAW_STATUS_UNAVAILABLE",
            "DAW connection status is unavailable.",
            source="capability",
            retryable=False,
            capability=capability_id,
            adapter=str(ctx.target_daw),
            details={
                "rawCode": "DAW_STATUS_UNAVAILABLE",
                "rawMessage": "DAW connection status is unavailable.",
            },
        )

    try:
        return get_connection_status()
    except PrestoError:
        raise
    except Exception as exc:
        message = str(exc).strip() or "Failed to read DAW connection status."
        raise PrestoError(
            "DAW_STATUS_UNAVAILABLE",
            "Failed to read DAW connection status.",
            source="capability",
            retryable=False,
            capability=capability_id,
            adapter=str(ctx.target_daw),
            details={
                "rawCode": "DAW_STATUS_UNAVAILABLE",
                "rawMessage": message,
            },
        ) from exc
