from __future__ import annotations

from typing import Any

from .common import ensure_daw_connected, validation_error
from ...domain.errors import PrestoError
from ...domain.ports import CapabilityExecutionContext
from ...integrations.daw.ptsl_catalog import PtslCommandCatalogEntry, list_commands, require_command


def _serialize_command(entry: PtslCommandCatalogEntry) -> dict[str, Any]:
    return {
        "commandName": entry.command_name,
        "commandId": entry.command_id,
        "requestMessage": entry.request_message,
        "responseMessage": entry.response_message,
        "hasPyPtslOp": entry.has_py_ptsl_op,
        "category": entry.category,
        "minimumHostVersion": entry.minimum_host_version,
    }


def daw_ptsl_catalog_list_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    _ = ctx
    category = payload.get("category")
    only_with_py_ptsl_op = payload.get("onlyWithPyPtslOp")

    commands = list(list_commands())
    if category is not None and str(category).strip():
        normalized_category = str(category).strip()
        commands = [entry for entry in commands if entry.category == normalized_category]
    if only_with_py_ptsl_op is not None:
        commands = [entry for entry in commands if entry.has_py_ptsl_op is bool(only_with_py_ptsl_op)]

    return {
        "commands": [_serialize_command(entry) for entry in commands],
    }


def daw_ptsl_command_describe_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    _ = ctx
    command_name = str(payload.get("commandName", "")).strip()
    if not command_name:
        raise validation_error(
            "commandName is required.",
            field="commandName",
            capability="daw.ptsl.command.describe",
        )

    return {
        "command": _serialize_command(require_command(command_name)),
    }


def daw_ptsl_command_execute_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "daw.ptsl.command.execute"
    command_name = str(payload.get("commandName", "")).strip()
    if not command_name:
        raise validation_error(
            "commandName is required.",
            field="commandName",
            capability=capability_id,
        )

    request_payload = payload.get("payload", {})
    if request_payload is None:
        request_payload = {}
    if not isinstance(request_payload, dict):
        raise validation_error(
            "payload must be an object when provided.",
            field="payload",
            capability=capability_id,
        )

    minimum_host_version = payload.get("minimumHostVersion")
    if minimum_host_version is not None:
        minimum_host_version = str(minimum_host_version).strip() or None

    daw = ensure_daw_connected(ctx, capability_id, payload, raise_on_error=True)
    execute = getattr(daw, "execute_ptsl_command", None)
    if not callable(execute):
        raise PrestoError(
            "PTSL_COMMAND_EXECUTION_UNAVAILABLE",
            "The current DAW adapter does not expose generic PTSL command execution.",
            source="runtime",
            retryable=False,
            capability=capability_id,
            adapter=str(ctx.target_daw),
            details={
                "rawCode": "PTSL_COMMAND_EXECUTION_UNAVAILABLE",
                "rawMessage": "The current DAW adapter does not expose generic PTSL command execution.",
                "commandName": command_name,
            },
        )

    return {
        "command": _serialize_command(require_command(command_name)),
        "result": execute(command_name, request_payload, minimum_host_version=minimum_host_version),
    }


def build_daw_ptsl_semantic_execute_payload(capability_id: str, command_name: str):
    def _handler(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
        request_payload = dict(payload or {})
        minimum_host_version = request_payload.pop("minimumHostVersion", None)
        if minimum_host_version is not None:
            minimum_host_version = str(minimum_host_version).strip() or None
        if command_name == "CId_CreateFadesBasedOnPreset" and "fade_preset_name" in request_payload:
            fade_preset_name = request_payload.get("fade_preset_name")
            if fade_preset_name is None or not str(fade_preset_name).strip():
                request_payload.pop("fade_preset_name", None)
            else:
                request_payload["fade_preset_name"] = str(fade_preset_name).strip()

        daw = ensure_daw_connected(ctx, capability_id, payload, raise_on_error=True)
        execute = getattr(daw, "execute_ptsl_command", None)
        if not callable(execute):
            raise PrestoError(
                "PTSL_COMMAND_EXECUTION_UNAVAILABLE",
                "The current DAW adapter does not expose semantic PTSL command execution.",
                source="runtime",
                retryable=False,
                capability=capability_id,
                adapter=str(ctx.target_daw),
                details={
                    "rawCode": "PTSL_COMMAND_EXECUTION_UNAVAILABLE",
                    "rawMessage": "The current DAW adapter does not expose semantic PTSL command execution.",
                    "commandName": command_name,
                },
            )

        return {
            "command": _serialize_command(require_command(command_name)),
            "result": execute(command_name, request_payload, minimum_host_version=minimum_host_version),
        }

    return _handler
