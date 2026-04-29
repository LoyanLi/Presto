from __future__ import annotations

import json
from pathlib import Path

from presto.application.capabilities.catalog import DEFAULT_CAPABILITY_DEFINITIONS
from presto.integrations.daw import ptsl_catalog, ptsl_requirements


def _definition_by_id(capability_id: str):
    return next(definition for definition in DEFAULT_CAPABILITY_DEFINITIONS if definition.id == capability_id)


def test_ptsl_requirements_json_contains_known_sections() -> None:
    requirements_path = Path(__file__).parents[1] / "integrations" / "daw" / "ptsl_requirements.json"
    raw = json.loads(requirements_path.read_text(encoding="utf-8"))

    assert set(raw.keys()) == {"commandMinimumHostVersionOverrides", "capabilityCommandDependencies"}
    assert raw["commandMinimumHostVersionOverrides"]["CId_GetTimeAsType"] == "2025.10.0"
    assert raw["capabilityCommandDependencies"]["daw.export.run.start"] == [
        "CId_GetSessionPath",
        "CId_GetTransportState",
        "CId_ExportMix",
    ]


def test_ptsl_requirements_references_known_catalog_commands() -> None:
    catalog_names = {entry.command_name for entry in ptsl_catalog.list_commands()}
    unknown_commands: list[tuple[str, str]] = []

    for command_name in ptsl_requirements.command_minimum_host_version_overrides():
        if command_name not in catalog_names:
            unknown_commands.append(("commandMinimumHostVersionOverrides", command_name))

    for capability_id, commands in ptsl_requirements.capability_command_dependencies().items():
        for command_name in commands:
            if command_name not in catalog_names:
                unknown_commands.append((capability_id, command_name))

    assert unknown_commands == []


def test_ptsl_requirements_resolves_capability_commands_from_implementation_or_dependency_data() -> None:
    export_mix = _definition_by_id("daw.export.mixWithSource")
    export_run = _definition_by_id("daw.export.run.start")
    split_automation = _definition_by_id("daw.automation.splitStereoToMono.execute")

    assert ptsl_requirements.ptsl_commands_for_definition(export_mix, "pro_tools") == ("CId_GetExportMixSourceList",)
    assert ptsl_requirements.ptsl_commands_for_definition(export_run, "pro_tools") == (
        "CId_GetSessionPath",
        "CId_GetTransportState",
        "CId_ExportMix",
    )
    assert ptsl_requirements.ptsl_commands_for_definition(split_automation, "pro_tools") == (
        "CId_GetTrackList",
        "CId_SelectTracksByName",
        "CId_RenameTargetTrack",
    )


def test_ptsl_requirements_calculates_capability_minimum_host_versions() -> None:
    definitions = {definition.id: definition for definition in DEFAULT_CAPABILITY_DEFINITIONS}

    assert ptsl_requirements.minimum_host_version_for_definition(
        definitions["daw.export.run.start"], "pro_tools"
    ) == "2022.12.0"
    assert ptsl_requirements.minimum_host_version_for_definition(
        definitions["daw.import.run.start"], "pro_tools"
    ) == "2022.12.0"
    assert ptsl_requirements.minimum_host_version_for_definition(
        definitions["daw.automation.splitStereoToMono.execute"], "pro_tools"
    ) == "2023.09.0"
    assert ptsl_requirements.minimum_host_version_for_definition(
        definitions["daw.export.mixWithSource"], "pro_tools"
    ) == "2025.06.0"
