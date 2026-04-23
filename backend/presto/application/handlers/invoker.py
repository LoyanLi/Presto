from __future__ import annotations

from typing import Any

from .context import build_execution_context
from .registry import HANDLER_BINDINGS
from .workflow_executor import start_workflow_run_payload
from ..service_container import ServiceContainer
from ...domain.capabilities import DEFAULT_DAW_TARGET, CapabilityDefinition
from ...domain.errors import PrestoValidationError

LOW_SIGNAL_SUCCESS_CAPABILITIES = frozenset(
    {
        "daw.connection.getStatus",
        "daw.adapter.getSnapshot",
        "jobs.get",
    }
)


def _resolve_handler(definition: CapabilityDefinition):
    return HANDLER_BINDINGS.get(definition.handler)


def _normalize_error_payload(error: Exception) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "type": error.__class__.__name__,
        "message": str(error),
    }
    code = getattr(error, "code", None)
    if isinstance(code, str) and code.strip():
        payload["code"] = code.strip()
    details = getattr(error, "details", None)
    if isinstance(details, dict) and details:
        payload["details"] = details
    return payload


def _should_log_success_lifecycle(capability_id: str) -> bool:
    return capability_id not in LOW_SIGNAL_SUCCESS_CAPABILITIES


def _execute_handler(
    services: ServiceContainer,
    definition: CapabilityDefinition,
    payload: dict[str, Any],
    *,
    request_id: str | None,
) -> Any:
    handler = _resolve_handler(definition)
    if handler is None:
        raise NotImplementedError(f"Capability not implemented: {definition.id}")

    ctx = build_execution_context(services, request_id=request_id)
    should_log_success_lifecycle = _should_log_success_lifecycle(definition.id)
    if ctx.logger is not None and should_log_success_lifecycle:
        ctx.logger.info(
            "capability.invoke.start",
            {
                "capability": definition.id,
                "requestId": ctx.request_id,
                "payload": payload,
            },
        )
    try:
        if definition.handler == "workflow.run.start":
            result = start_workflow_run_payload(
                ctx,
                payload,
                invoke_capability=lambda capability_id, request_payload: _execute_atomic_capability(
                    services,
                    capability_id,
                    request_payload,
                    request_id=request_id,
                ),
            )
        else:
            result = handler(ctx, payload)
    except Exception as error:
        if ctx.logger is not None:
            ctx.logger.error(
                "capability.invoke.failed",
                {
                    "capability": definition.id,
                    "requestId": ctx.request_id,
                    "payload": payload,
                    "error": _normalize_error_payload(error),
                },
            )
        raise

    if ctx.logger is not None and should_log_success_lifecycle:
        ctx.logger.info(
            "capability.invoke.succeeded",
            {
                "capability": definition.id,
                "requestId": ctx.request_id,
                "result": result,
            },
        )
    return result


def _execute_atomic_capability(
    services: ServiceContainer,
    capability_id: str,
    payload: dict[str, Any],
    *,
    request_id: str | None = None,
) -> Any:
    definition = services.capability_registry.require(capability_id)
    if capability_id == "workflow.run.start":
        raise NotImplementedError(f"Capability not implemented: {capability_id}")
    return _execute_handler(services, definition, payload, request_id=request_id)


def _collect_payload_field_paths(payload: Any, prefix: str = "") -> set[str]:
    if isinstance(payload, dict):
        fields: set[str] = set()
        for key, value in payload.items():
            field_name = f"{prefix}.{key}" if prefix else str(key)
            fields.add(field_name)
            fields.update(_collect_payload_field_paths(value, field_name))
        return fields
    if isinstance(payload, list):
        fields: set[str] = set()
        list_prefix = f"{prefix}[]" if prefix else "[]"
        for value in payload:
            fields.update(_collect_payload_field_paths(value, list_prefix))
        return fields
    return set()


def _validate_payload_fields(definition: CapabilityDefinition, payload: dict[str, Any], target_daw: str) -> None:
    support = definition.field_support.get(target_daw)
    if support is None or len(support.request_fields) == 0:
        return

    present_fields = _collect_payload_field_paths(payload)
    unsupported_fields = sorted(field for field in present_fields if field not in support.request_fields)
    if unsupported_fields:
        raise PrestoValidationError(
            f"Unsupported fields for {definition.id} on {target_daw}: {', '.join(unsupported_fields)}",
            details={
                "capabilityId": definition.id,
                "targetDaw": target_daw,
                "unsupportedFields": unsupported_fields,
            },
            capability=definition.id,
        )


def execute_capability(
    services: ServiceContainer,
    capability_id: str,
    payload: dict[str, Any],
    *,
    request_id: str | None = None,
) -> Any:
    definition = services.capability_registry.require(capability_id)
    _validate_payload_fields(definition, payload, services.target_daw or DEFAULT_DAW_TARGET)
    return _execute_handler(services, definition, payload, request_id=request_id)
