from __future__ import annotations

from presto.integrations.daw import ptsl_catalog


def test_generated_ptsl_catalog_exposes_known_commands() -> None:
    names = {entry.command_name for entry in ptsl_catalog.list_commands()}

    assert "CId_GetTrackList" in names
    assert "CId_SetTrackRecordEnableState" in names
    assert "CId_DeleteTracks" in names
    assert "CId_GetClipList" in names


def test_generated_ptsl_catalog_exposes_command_metadata() -> None:
    entry = ptsl_catalog.require_command("CId_GetTrackList")

    assert entry.command_id == 3
    assert entry.request_message == "GetTrackListRequestBody"
    assert entry.response_message == "GetTrackListResponseBody"
    assert isinstance(entry.has_py_ptsl_op, bool)
    assert entry.minimum_host_version == "2022.12.0"


def test_generated_ptsl_catalog_requires_every_command_to_have_minimum_host_version() -> None:
    missing_versions = [entry.command_name for entry in ptsl_catalog.list_commands() if not entry.minimum_host_version]
    malformed_versions = [
        (entry.command_name, entry.minimum_host_version)
        for entry in ptsl_catalog.list_commands()
        if entry.minimum_host_version and entry.minimum_host_version.count(".") != 2
    ]

    assert missing_versions == []
    assert malformed_versions == []


def test_generated_ptsl_catalog_supports_name_lookup_without_sdk_runtime_dependency() -> None:
    entry = ptsl_catalog.get_command("CId_GetTrackList")

    assert entry is not None
    assert entry.command_name == "CId_GetTrackList"
