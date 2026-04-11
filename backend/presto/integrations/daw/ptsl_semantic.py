from __future__ import annotations

import re
from typing import Any

from .ptsl_catalog import PtslCommandCatalogEntry, list_commands


_PASCAL_TOKEN_PATTERN = re.compile(r"[A-Z]+(?=[A-Z][a-z]|$)|[A-Z]?[a-z]+|\d+")
_CANONICAL_CAPABILITY_ID_BY_COMMAND: dict[str, str] = {
    "CId_GetTrackList": "track.list",
    "CId_SelectAllClipsOnTrack": "clip.selectAllOnTrack",
    "CId_SaveSession": "session.save",
    "CId_GetSessionLength": "session.getLength",
    "CId_SelectTracksByName": "track.select",
    "CId_SetTrackColor": "track.color.apply",
    "CId_SetTrackMuteState": "track.mute.set",
    "CId_SetTrackSoloState": "track.solo.set",
    "CId_SetTrackHiddenState": "track.hidden.set",
    "CId_SetTrackInactiveState": "track.inactive.set",
    "CId_SetTrackRecordEnableState": "track.recordEnable.set",
    "CId_SetTrackRecordSafeEnableState": "track.recordSafe.set",
    "CId_SetTrackInputMonitorState": "track.inputMonitor.set",
    "CId_SetTrackOnlineState": "track.online.set",
    "CId_SetTrackFrozenState": "track.frozen.set",
    "CId_SetTrackOpenState": "track.open.set",
}
_ACTION_OVERRIDE_BY_COMMAND: dict[str, str] = {
    "CId_GetPtslVersion": "getSdkVersion",
}


def _snake_to_lower_camel(value: str | None) -> str:
    text = str(value or "").strip()
    if not text:
        return "general"

    parts = [part for part in text.split("_") if part]
    if not parts:
        return "general"

    head, *tail = parts
    return head.lower() + "".join(part[:1].upper() + part[1:].lower() for part in tail)


def _pascal_to_lower_camel(value: str) -> str:
    text = str(value).strip()
    if not text:
        return ""

    tokens = _PASCAL_TOKEN_PATTERN.findall(text)
    if not tokens:
        return text[:1].lower() + text[1:]

    head, *tail = tokens
    return head.lower() + "".join(token[:1].upper() + token[1:].lower() for token in tail)


def canonical_capability_id(entry: PtslCommandCatalogEntry) -> str | None:
    return _CANONICAL_CAPABILITY_ID_BY_COMMAND.get(entry.command_name)


def is_generated_semantic_command(entry: PtslCommandCatalogEntry) -> bool:
    return canonical_capability_id(entry) is None


def generated_semantic_capability_id(entry: PtslCommandCatalogEntry) -> str:
    category = _snake_to_lower_camel(entry.category)
    action = _ACTION_OVERRIDE_BY_COMMAND.get(entry.command_name)
    if action is None:
        command_stem = entry.command_name[4:] if entry.command_name.startswith("CId_") else entry.command_name
        action = _pascal_to_lower_camel(command_stem)
    if not action:
        raise ValueError(f"Unable to derive semantic capability id for {entry.command_name}.")
    return f"daw.{category}.{action}"


def semantic_capability_id(entry: PtslCommandCatalogEntry) -> str:
    return canonical_capability_id(entry) or generated_semantic_capability_id(entry)


def semantic_capability_definition(entry: PtslCommandCatalogEntry) -> dict[str, Any]:
    if not is_generated_semantic_command(entry):
        raise ValueError(f"{entry.command_name} is mapped to an existing canonical capability.")

    capability_id = generated_semantic_capability_id(entry)
    kind = "query" if entry.response_message else "command"
    return {
        "id": capability_id,
        "version": 1,
        "kind": kind,
        "domain": "daw",
        "visibility": "public",
        "description": f"DAW 语义命令封装（当前由 Pro Tools PTSL 实现）：{entry.command_name}",
        "requestSchema": {
            "name": "DawPtslSemanticRequest",
            "package": "@presto/contracts",
            "version": 1,
        },
        "responseSchema": {
            "name": "DawPtslSemanticResponse",
            "package": "@presto/contracts",
            "version": 1,
        },
        "dependsOn": ["daw"],
        "workflowScope": "daw_specific",
        "portability": "daw_specific",
        "supportedDaws": ["pro_tools"],
        "canonicalSource": "pro_tools",
        "fieldSupport": {
            "pro_tools": {
                "requestFields": [],
                "responseFields": ["command", "result"],
            }
        },
        "implementations": {
            "pro_tools": {
                "kind": "ptsl_command",
                "command": entry.command_name,
            }
        },
        "handler": capability_id,
    }


def list_semantic_capability_definitions() -> list[dict[str, Any]]:
    definitions = [semantic_capability_definition(entry) for entry in list_commands() if is_generated_semantic_command(entry)]
    ids = [definition["id"] for definition in definitions]
    if len(set(ids)) != len(ids):
        raise ValueError("Generated PTSL semantic capability ids must be unique.")
    return definitions


__all__ = [
    "canonical_capability_id",
    "generated_semantic_capability_id",
    "is_generated_semantic_command",
    "semantic_capability_definition",
    "semantic_capability_id",
    "list_semantic_capability_definitions",
]
