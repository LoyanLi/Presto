from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Iterable

from ...domain.errors import PrestoError
from .ptsl_catalog import PtslCommandCatalogEntry, list_commands, require_command

try:  # pragma: no cover - availability depends on runtime environment
    from ptsl import ops
except Exception:  # pragma: no cover
    ops = None  # type: ignore[assignment]


def _parse_version(value: str | None) -> tuple[int, int, int] | None:
    if not value:
        return None
    pieces = [piece for piece in str(value).strip().split(".") if piece]
    if not pieces:
        return None
    ints = [int(piece) for piece in pieces[:3]]
    while len(ints) < 3:
        ints.append(0)
    return tuple(ints[:3])


class PtslCommandRunner:
    def __init__(self, entries: Iterable[PtslCommandCatalogEntry] | None = None, *, host_version: str | None = None) -> None:
        self._entries = {entry.command_name: entry for entry in (tuple(entries) if entries is not None else list_commands())}
        self._host_version = host_version

    def run(
        self,
        engine: Any,
        command_name: str,
        payload: dict[str, Any],
        *,
        capability: str,
        minimum_host_version: str | None = None,
    ) -> Any:
        entry = self._entries.get(command_name)
        if entry is None:
            raise PrestoError(
                "PTSL_COMMAND_UNAVAILABLE",
                f"PTSL command id '{command_name}' not found.",
                source="runtime",
                retryable=False,
                details={"command_name": command_name},
                capability=capability,
                adapter="pro_tools",
            )

        if minimum_host_version is not None and self._host_version is not None:
            required = _parse_version(minimum_host_version)
            current = _parse_version(self._host_version)
            if required is not None and current is not None and current < required:
                raise PrestoError(
                    "PTSL_VERSION_UNSUPPORTED",
                    f"Current Pro Tools/PTSL version {self._host_version} is below required {minimum_host_version}.",
                    source="runtime",
                    retryable=False,
                    details={
                        "command_name": command_name,
                        "host_version": self._host_version,
                        "minimum_host_version": minimum_host_version,
                    },
                    capability=capability,
                    adapter="pro_tools",
                )

        client = getattr(engine, "client", None)
        if client is None:
            raise PrestoError(
                "PTSL_CLIENT_UNAVAILABLE",
                "The current Pro Tools engine does not expose a PTSL client.",
                source="runtime",
                retryable=False,
                details={"command_name": command_name},
                capability=capability,
                adapter="pro_tools",
            )

        try:
            if entry.has_py_ptsl_op and ops is not None and hasattr(client, "run"):
                op_class = getattr(ops, command_name, None)
                if op_class is not None:
                    operation = op_class(**payload)
                    client.run(operation)
                    return getattr(operation, "response", None)
            return client.run_command(entry.command_id, payload)
        except PrestoError:
            raise
        except Exception as exc:
            raise PrestoError(
                "PTSL_COMMAND_FAILED",
                str(exc) or f"Failed to execute {command_name}.",
                source="runtime",
                retryable=False,
                details={
                    "command_name": command_name,
                    "payload": dict(payload),
                    "raw_exception": str(exc) or None,
                    "exception_type": type(exc).__name__,
                },
                capability=capability,
                adapter="pro_tools",
            ) from exc


__all__ = ["PtslCommandCatalogEntry", "PtslCommandRunner"]
