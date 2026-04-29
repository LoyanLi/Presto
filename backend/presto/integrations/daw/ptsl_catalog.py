from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ...domain.errors import PrestoError
from . import ptsl_catalog_generated


_MESSAGE_NAME_FIXUPS = {
    "CanceBatchJobRequestBody": "CancelBatchJobRequestBody",
}


@dataclass(frozen=True)
class PtslCommandCatalogEntry:
    command_name: str
    command_id: int
    request_message: str | None
    response_message: str | None
    has_py_ptsl_op: bool
    category: str | None
    minimum_host_version: str


_COMMANDS = tuple(
    PtslCommandCatalogEntry(
        command_name=str(entry["command_name"]),
        command_id=int(entry["command_id"]),
        request_message=_MESSAGE_NAME_FIXUPS.get(str(entry["request_message"]), str(entry["request_message"]))
        if entry.get("request_message")
        else None,
        response_message=_MESSAGE_NAME_FIXUPS.get(str(entry["response_message"]), str(entry["response_message"]))
        if entry.get("response_message")
        else None,
        has_py_ptsl_op=bool(entry.get("has_py_ptsl_op", False)),
        category=str(entry["category"]) if entry.get("category") else None,
        minimum_host_version=str(entry["minimum_host_version"]),
    )
    for entry in ptsl_catalog_generated.PTSL_COMMAND_CATALOG
)
_COMMANDS_BY_NAME = {entry.command_name: entry for entry in _COMMANDS}


def list_commands() -> tuple[PtslCommandCatalogEntry, ...]:
    return _COMMANDS


def get_command(command_name: str) -> PtslCommandCatalogEntry | None:
    return _COMMANDS_BY_NAME.get(command_name)


def require_command(command_name: str) -> PtslCommandCatalogEntry:
    entry = get_command(command_name)
    if entry is None:
        raise PrestoError(
            "PTSL_COMMAND_UNAVAILABLE",
            f"PTSL command id '{command_name}' not found.",
            source="runtime",
            retryable=False,
            details={"command_name": command_name},
        )
    return entry


__all__ = ["PtslCommandCatalogEntry", "list_commands", "get_command", "require_command"]
