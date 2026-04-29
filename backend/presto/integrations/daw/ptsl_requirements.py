from __future__ import annotations

import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

from .ptsl_catalog import get_command


_REQUIREMENTS_PATH = Path(__file__).with_name("ptsl_requirements.json")
_VERSION_PATTERN = re.compile(r"^\d{4}\.\d{1,2}\.\d+$")


def _parse_version(value: str) -> tuple[int, int, int]:
    if not _VERSION_PATTERN.match(value):
        raise ValueError(f"Invalid PTSL host version: {value}")
    pieces = [int(piece) for piece in value.split(".")]
    return pieces[0], pieces[1], pieces[2]


def _highest_version(versions: list[str]) -> str | None:
    highest: str | None = None
    highest_tuple: tuple[int, int, int] | None = None
    for version in versions:
        version_tuple = _parse_version(version)
        if highest_tuple is None or version_tuple > highest_tuple:
            highest = version
            highest_tuple = version_tuple
    return highest


def _normalize_command_map(raw: Any, section_name: str) -> dict[str, str]:
    if not isinstance(raw, dict):
        raise ValueError(f"ptsl_requirements.json {section_name} must be an object")

    normalized: dict[str, str] = {}
    for raw_command_name, raw_version in raw.items():
        command_name = str(raw_command_name).strip()
        version = str(raw_version).strip()
        if not command_name or not version:
            raise ValueError(f"ptsl_requirements.json {section_name} entries must be non-empty")
        _parse_version(version)
        _require_known_command(command_name, section_name)
        normalized[command_name] = version
    return normalized


def _normalize_dependencies(raw: Any, section_name: str) -> dict[str, tuple[str, ...]]:
    if not isinstance(raw, dict):
        raise ValueError(f"ptsl_requirements.json {section_name} must be an object")

    normalized: dict[str, tuple[str, ...]] = {}
    for raw_capability_id, raw_commands in raw.items():
        capability_id = str(raw_capability_id).strip()
        if not capability_id:
            raise ValueError(f"ptsl_requirements.json {section_name} capability ids must be non-empty")
        if not isinstance(raw_commands, list):
            raise ValueError(f"ptsl_requirements.json {section_name}.{capability_id} must be a list")
        commands: list[str] = []
        for raw_command_name in raw_commands:
            command_name = str(raw_command_name).strip()
            if not command_name:
                raise ValueError(f"ptsl_requirements.json {section_name}.{capability_id} contains an empty command")
            _require_known_command(command_name, capability_id)
            commands.append(command_name)
        normalized[capability_id] = tuple(commands)
    return normalized


def _require_known_command(command_name: str, source: str) -> None:
    if get_command(command_name) is None:
        raise ValueError(f"ptsl_requirements.json {source} references unknown PTSL command {command_name}")


@lru_cache(maxsize=1)
def _load_requirements() -> tuple[dict[str, str], dict[str, tuple[str, ...]]]:
    raw = json.loads(_REQUIREMENTS_PATH.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError("ptsl_requirements.json must be an object")

    return (
        _normalize_command_map(
            raw.get("commandMinimumHostVersionOverrides"),
            "commandMinimumHostVersionOverrides",
        ),
        _normalize_dependencies(
            raw.get("capabilityCommandDependencies"),
            "capabilityCommandDependencies",
        ),
    )


def command_minimum_host_version_overrides() -> dict[str, str]:
    overrides, _dependencies = _load_requirements()
    return dict(overrides)


def capability_command_dependencies() -> dict[str, tuple[str, ...]]:
    _overrides, dependencies = _load_requirements()
    return dict(dependencies)


def ptsl_commands_for_definition(definition: Any, target_daw: str) -> tuple[str, ...]:
    implementation = getattr(definition, "implementations", {}).get(target_daw)
    if implementation is not None:
        kind = getattr(implementation, "kind", "")
        if kind == "ptsl_command" and getattr(implementation, "command", None):
            command_name = str(implementation.command)
            _require_known_command(command_name, str(getattr(definition, "id", "")))
            return (command_name,)
        if kind == "ptsl_composed":
            commands = tuple(str(command) for command in getattr(implementation, "commands", ()) if command)
            for command_name in commands:
                _require_known_command(command_name, str(getattr(definition, "id", "")))
            return commands

    capability_id = str(getattr(definition, "id", ""))
    return _load_requirements()[1].get(capability_id, ())


def minimum_host_version_for_definition(definition: Any, target_daw: str) -> str | None:
    versions: list[str] = []
    for command_name in ptsl_commands_for_definition(definition, target_daw):
        entry = get_command(command_name)
        if entry is None:
            raise ValueError(f"Capability {getattr(definition, 'id', '')} references unknown PTSL command {command_name}")
        versions.append(entry.minimum_host_version)
    return _highest_version(versions)


__all__ = [
    "capability_command_dependencies",
    "command_minimum_host_version_overrides",
    "minimum_host_version_for_definition",
    "ptsl_commands_for_definition",
]
