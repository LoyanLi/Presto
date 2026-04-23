from __future__ import annotations

import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from ..domain.ports import LoggerPort


_EXECUTION_LOG_PREFIX = "PRESTO_EXEC_LOG "
_REDACTED = "***REDACTED***"
_MAX_DEPTH = 4
_MAX_STRING_LENGTH = 4096
_MAX_DATA_LENGTH = 16384
_REDACT_KEYS = ("token", "secret", "password", "authorization", "apikey", "api_key")


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _truncate_text(value: str, *, limit: int = _MAX_STRING_LENGTH) -> str:
    if len(value) <= limit:
        return value
    return f"{value[:limit]}...[truncated:{len(value) - limit}]"


def _is_redacted_key(key: str) -> bool:
    lowered = key.lower()
    return any(fragment in lowered for fragment in _REDACT_KEYS)


def _sanitize_value(value: Any, *, depth: int = 0) -> Any:
    if depth >= _MAX_DEPTH:
        return "[max-depth]"
    if isinstance(value, str):
        return _truncate_text(value)
    if isinstance(value, (bool, int, float)) or value is None:
        return value
    if isinstance(value, dict):
        sanitized: dict[str, Any] = {}
        for key, nested in value.items():
            resolved_key = str(key)
            sanitized[resolved_key] = _REDACTED if _is_redacted_key(resolved_key) else _sanitize_value(
                nested,
                depth=depth + 1,
            )
        return sanitized
    if isinstance(value, (list, tuple, set)):
        return [_sanitize_value(item, depth=depth + 1) for item in value]
    return _truncate_text(repr(value))


def _normalize_data(meta: dict[str, Any] | None) -> dict[str, Any] | None:
    if not meta:
        return None
    sanitized = _sanitize_value(meta)
    encoded = json.dumps(sanitized, ensure_ascii=True, separators=(",", ":"))
    if len(encoded) <= _MAX_DATA_LENGTH:
        return sanitized
    return {
        "truncated": True,
        "preview": _truncate_text(encoded, limit=_MAX_DATA_LENGTH),
    }


@dataclass
class StdErrJsonExecutionLogger(LoggerPort):
    source: str = "backend.execution"

    def debug(self, message: str, meta: dict[str, Any] | None = None) -> None:
        self._write("debug", message, meta)

    def info(self, message: str, meta: dict[str, Any] | None = None) -> None:
        self._write("info", message, meta)

    def warn(self, message: str, meta: dict[str, Any] | None = None) -> None:
        self._write("warn", message, meta)

    def error(self, message: str, meta: dict[str, Any] | None = None) -> None:
        self._write("error", message, meta)

    def _write(self, level: str, message: str, meta: dict[str, Any] | None) -> None:
        entry = {
            "kind": "execution",
            "ts": _utc_now(),
            "level": level,
            "source": self.source,
            "event": str(meta.get("event")) if isinstance(meta, dict) and isinstance(meta.get("event"), str) else message,
            "message": str(meta.get("message")) if isinstance(meta, dict) and isinstance(meta.get("message"), str) else message,
        }
        if isinstance(meta, dict):
            passthrough_fields = (
                "sessionId",
                "jobId",
                "requestId",
                "pluginId",
                "workflowId",
                "capability",
                "stepId",
            )
            for field in passthrough_fields:
                value = meta.get(field)
                if isinstance(value, str) and value.strip():
                    entry[field] = value.strip()
        data = _normalize_data(meta)
        if data:
            entry["data"] = data

        sys.stderr.write(f"{_EXECUTION_LOG_PREFIX}{json.dumps(entry, ensure_ascii=True, separators=(',', ':'))}\n")
        sys.stderr.flush()


def create_default_execution_logger() -> LoggerPort:
    return StdErrJsonExecutionLogger()
