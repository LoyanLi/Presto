from __future__ import annotations

import json
from typing import Any, Iterable

from google.protobuf import json_format

from ...domain.errors import PrestoError
from .ptsl_catalog import PtslCommandCatalogEntry, list_commands

try:  # pragma: no cover - availability depends on runtime environment
    from ptsl import PTSL_pb2 as pt
except Exception:  # pragma: no cover
    pt = None  # type: ignore[assignment]


_SCHEMA_UNAVAILABLE = object()


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

    @staticmethod
    def _message_to_dict(message: Any) -> dict[str, Any]:
        return json_format.MessageToDict(
            message,
            preserving_proto_field_name=True,
            always_print_fields_with_no_presence=True,
        )

    @staticmethod
    def _canonicalize_payload_shape(descriptor: Any, payload: Any) -> Any:
        if not isinstance(payload, dict):
            return payload

        normalized: dict[str, Any] = {}
        fields_by_name = {field.name: field for field in descriptor.fields}
        fields_by_json_name = {field.json_name: field for field in descriptor.fields}
        for raw_key, raw_value in payload.items():
            key = str(raw_key)
            field = fields_by_name.get(key) or fields_by_json_name.get(key)
            canonical_key = field.name if field is not None else key
            normalized[canonical_key] = PtslCommandRunner._canonicalize_field_shape(field, raw_value)
        return normalized

    @staticmethod
    def _canonicalize_field_shape(field: Any, value: Any) -> Any:
        if field is None:
            return value
        if field.message_type is None:
            return value
        if field.label == field.LABEL_REPEATED:
            if not isinstance(value, list):
                return value
            return [PtslCommandRunner._canonicalize_payload_shape(field.message_type, item) for item in value]
        return PtslCommandRunner._canonicalize_payload_shape(field.message_type, value)

    @staticmethod
    def _prune_injected_absent_fields(serialized: Any, payload_shape: Any) -> Any:
        if isinstance(serialized, dict):
            if not isinstance(payload_shape, dict):
                return serialized
            pruned: dict[str, Any] = {}
            for key, value in serialized.items():
                if key not in payload_shape:
                    continue
                pruned[key] = PtslCommandRunner._prune_injected_absent_fields(value, payload_shape[key])
            return pruned
        if isinstance(serialized, list):
            if not isinstance(payload_shape, list):
                return serialized
            if not payload_shape:
                return list(serialized)
            return [
                PtslCommandRunner._prune_injected_absent_fields(
                    item,
                    payload_shape[index] if index < len(payload_shape) else payload_shape[-1],
                )
                for index, item in enumerate(serialized)
            ]
        return serialized

    def _resolve_message_type(
        self,
        message_name: str | None,
        *,
        kind: str,
        capability: str,
        command_name: str,
    ) -> Any | None | object:
        if message_name is None:
            return None
        if pt is None:
            raise PrestoError(
                "PTSL_NOT_INSTALLED",
                "py-ptsl is not available in this environment.",
                source="runtime",
                retryable=False,
                details={"command_name": command_name, "message_name": message_name, "message_kind": kind},
                capability=capability,
                adapter="pro_tools",
            )
        message_type = getattr(pt, message_name, None)
        if message_type is None:
            return _SCHEMA_UNAVAILABLE
        return message_type

    def _normalize_request_payload(
        self,
        entry: PtslCommandCatalogEntry,
        payload: dict[str, Any],
        *,
        capability: str,
    ) -> dict[str, Any]:
        normalized_payload = dict(payload or {})
        message_type = self._resolve_message_type(
            entry.request_message,
            kind="request",
            capability=capability,
            command_name=entry.command_name,
        )
        if message_type is None:
            if normalized_payload:
                raise PrestoError(
                    "PTSL_REQUEST_INVALID",
                    f"{entry.command_name} does not accept a request payload.",
                    source="runtime",
                    retryable=False,
                    details={"command_name": entry.command_name, "payload": normalized_payload},
                    capability=capability,
                    adapter="pro_tools",
                )
            return {}
        if message_type is _SCHEMA_UNAVAILABLE:
            return normalized_payload

        try:
            message = message_type()
            json_format.ParseDict(normalized_payload, message, ignore_unknown_fields=False)
        except Exception as exc:
            raise PrestoError(
                "PTSL_REQUEST_INVALID",
                str(exc) or f"Invalid request payload for {entry.command_name}.",
                source="runtime",
                retryable=False,
                details={
                    "command_name": entry.command_name,
                    "request_message": entry.request_message,
                    "payload": normalized_payload,
                    "exception_type": type(exc).__name__,
                    "raw_exception": str(exc) or None,
                },
                capability=capability,
                adapter="pro_tools",
            ) from exc
        payload_shape = self._canonicalize_payload_shape(message.DESCRIPTOR, normalized_payload)
        return self._prune_injected_absent_fields(self._message_to_dict(message), payload_shape)

    @staticmethod
    def _normalize_get_track_list_response(response: Any) -> dict[str, Any]:
        if response is None:
            return {"track_list": []}
        if not isinstance(response, dict):
            raise TypeError("GetTrackList response must be an object.")
        normalized = dict(response)
        if normalized.get("track_list") == {}:
            normalized["track_list"] = []
        return normalized

    @staticmethod
    def _normalize_get_playback_mode_response(response: Any) -> dict[str, Any]:
        if response is None:
            return {}
        if not isinstance(response, dict):
            raise TypeError("GetPlaybackMode response must be an object.")
        if pt is None:
            return dict(response)
        normalized = dict(response)

        def _coerce(values: Any) -> Any:
            if not isinstance(values, list):
                return values
            converted: list[Any] = []
            for value in values:
                if isinstance(value, str):
                    converted.append(pt.PlaybackMode.Value(value))
                else:
                    converted.append(value)
            return converted

        normalized["current_settings"] = _coerce(normalized.get("current_settings", []))
        normalized["possible_settings"] = _coerce(normalized.get("possible_settings", []))
        return normalized

    @staticmethod
    def _normalize_get_session_interleaved_state_response(response: Any) -> dict[str, Any]:
        if response is None:
            return {}
        if not isinstance(response, dict):
            raise TypeError("GetSessionInterleavedState response must be an object.")
        normalized = dict(response)
        normalized["possible_settings"] = [True, False]
        return normalized

    def _normalize_response_payload(
        self,
        entry: PtslCommandCatalogEntry,
        response: Any,
        *,
        capability: str,
    ) -> Any:
        if entry.response_message is None:
            return response

        message_type = self._resolve_message_type(
            entry.response_message,
            kind="response",
            capability=capability,
            command_name=entry.command_name,
        )
        if message_type is _SCHEMA_UNAVAILABLE:
            return response
        assert message_type is not None

        try:
            if entry.command_name == "CId_GetTrackList":
                normalized = self._normalize_get_track_list_response(response)
            elif entry.command_name == "CId_GetPlaybackMode":
                normalized = self._normalize_get_playback_mode_response(response)
            elif entry.command_name == "CId_GetSessionInterleavedState":
                normalized = self._normalize_get_session_interleaved_state_response(response)
            else:
                if response is None:
                    normalized = {}
                elif isinstance(response, dict):
                    normalized = dict(response)
                else:
                    raise TypeError(f"{entry.command_name} response must be an object.")

            message = message_type()
            json_format.ParseDict(normalized, message, ignore_unknown_fields=True)
        except Exception as exc:
            raise PrestoError(
                "PTSL_RESPONSE_INVALID",
                str(exc) or f"Invalid response payload for {entry.command_name}.",
                source="runtime",
                retryable=False,
                details={
                    "command_name": entry.command_name,
                    "response_message": entry.response_message,
                    "response": response,
                    "exception_type": type(exc).__name__,
                    "raw_exception": str(exc) or None,
                },
                capability=capability,
                adapter="pro_tools",
            ) from exc
        return self._message_to_dict(message)

    def _resolve_required_version(self, entry: PtslCommandCatalogEntry, minimum_host_version: str | None) -> str:
        candidates = [value for value in (entry.minimum_host_version, minimum_host_version) if value]
        resolved = candidates[0]
        resolved_tuple = _parse_version(resolved)
        for candidate in candidates[1:]:
            candidate_tuple = _parse_version(candidate)
            if candidate_tuple is None:
                continue
            if resolved_tuple is None or candidate_tuple > resolved_tuple:
                resolved = candidate
                resolved_tuple = candidate_tuple
        return resolved

    def run(
        self,
        engine: Any,
        command_name: str,
        payload: dict[str, Any],
        *,
        capability: str,
        minimum_host_version: str | None = None,
        host_version: str | None = None,
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

        required_version = self._resolve_required_version(entry, minimum_host_version)
        resolved_host_version = str(host_version or self._host_version or "").strip()
        if not resolved_host_version:
            raise PrestoError(
                "PTSL_VERSION_UNKNOWN",
                f"Cannot verify Pro Tools/PTSL version required for {command_name}.",
                source="runtime",
                retryable=False,
                details={
                    "command_name": command_name,
                    "minimum_host_version": required_version,
                },
                capability=capability,
                adapter="pro_tools",
            )

        if required_version is not None:
            required = _parse_version(required_version)
            current = _parse_version(resolved_host_version)
            if required is not None and current is not None and current < required:
                raise PrestoError(
                    "PTSL_VERSION_UNSUPPORTED",
                    f"Current Pro Tools/PTSL version {resolved_host_version} is below required {required_version}.",
                    source="runtime",
                    retryable=False,
                    details={
                        "command_name": command_name,
                        "host_version": resolved_host_version,
                        "minimum_host_version": required_version,
                    },
                    capability=capability,
                    adapter="pro_tools",
                )

        client = getattr(engine, "client", None)
        run_command = getattr(client, "run_command", None) if client is not None else None
        if not callable(run_command):
            raise PrestoError(
                "PTSL_CLIENT_UNAVAILABLE",
                "The current Pro Tools engine does not expose a PTSL client.",
                source="runtime",
                retryable=False,
                details={"command_name": command_name},
                capability=capability,
                adapter="pro_tools",
            )

        normalized_request = self._normalize_request_payload(entry, payload, capability=capability)

        try:
            response = run_command(entry.command_id, normalized_request)
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
                    "payload": dict(normalized_request),
                    "raw_exception": str(exc) or None,
                    "exception_type": type(exc).__name__,
                },
                capability=capability,
                adapter="pro_tools",
            ) from exc
        return self._normalize_response_payload(entry, response, capability=capability)


__all__ = ["PtslCommandCatalogEntry", "PtslCommandRunner"]
