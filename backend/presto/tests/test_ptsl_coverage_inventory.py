from __future__ import annotations

import json
import subprocess
from pathlib import Path

from ptsl import PTSL_pb2 as pt

from presto.integrations.daw.ptsl_catalog import list_commands


REPO_ROOT = Path(__file__).resolve().parents[3]
REPORT_PATH = REPO_ROOT / "build" / "ptsl-coverage.json"


def test_generated_ptsl_catalog_still_contains_153_commands() -> None:
    assert len(list_commands()) == 153


def test_catalog_message_name_resolution_matches_current_py_ptsl_package() -> None:
    unresolved_requests: list[str] = []
    unresolved_responses: list[str] = []

    for entry in list_commands():
        if entry.request_message and getattr(pt, entry.request_message, None) is None:
            unresolved_requests.append(entry.command_name)
        if entry.response_message and getattr(pt, entry.response_message, None) is None:
            unresolved_responses.append(entry.command_name)

    assert unresolved_requests == [
        "CId_SetTrackHeight",
        "CId_ClearTrackMainOutputAssignments",
        "CId_DeleteSignalPaths",
        "CId_GetTrackMainOutputAssignments",
    ]
    assert unresolved_responses == [
        "CId_SetTrackHeight",
        "CId_ClearTrackMainOutputAssignments",
        "CId_GetRendererOutSignalPath",
        "CId_DeleteSignalPaths",
        "CId_GetTrackMainOutputAssignments",
    ]


def test_report_ptsl_coverage_generates_machine_readable_inventory() -> None:
    completed = subprocess.run(
        ["node", "scripts/report-ptsl-coverage.mjs"],
        cwd=REPO_ROOT,
        check=False,
        capture_output=True,
        text=True,
    )

    assert completed.returncode == 0, completed.stderr or completed.stdout
    assert REPORT_PATH.exists()

    report = json.loads(REPORT_PATH.read_text("utf-8"))
    assert report["totalCatalogCommands"] == 153
    assert report["commandsWithPyPtslOps"] == 116
    assert report["requestSchemasResolved"] == 95
    assert report["requestSchemaCommandCount"] == 99
    assert report["unresolvedRequestSchemas"] == [
        "CId_SetTrackHeight",
        "CId_ClearTrackMainOutputAssignments",
        "CId_DeleteSignalPaths",
        "CId_GetTrackMainOutputAssignments",
    ]
    assert report["responseSchemasResolved"] == 64
    assert report["responseSchemaCommandCount"] == 69
    assert report["unresolvedResponseSchemas"] == [
        "CId_SetTrackHeight",
        "CId_ClearTrackMainOutputAssignments",
        "CId_GetRendererOutSignalPath",
        "CId_DeleteSignalPaths",
        "CId_GetTrackMainOutputAssignments",
    ]
    assert report["adapterDirectClientRunCommandCallCount"] == 0
    assert report["adapterDirectClientRunCallCount"] == 0
    assert report["internalPtslCapabilityIds"] == [
        "daw.ptsl.catalog.list",
        "daw.ptsl.command.describe",
        "daw.ptsl.command.execute",
    ]
    assert report["generatedPublicPtslSemanticCapabilityCount"] == 137
    assert len(report["generatedPublicPtslSemanticCapabilityIds"]) == 137
    assert report["generatedPublicPtslSemanticCapabilityIds"][0].startswith("daw.")
    assert all(not capability_id.startswith("daw.ptsl.") for capability_id in report["generatedPublicPtslSemanticCapabilityIds"])
    assert report["canonicalPublicCapabilityCoverageCount"] == 16
    assert len(report["canonicalPublicCapabilityIdsCoveringPtsl"]) == 16
    assert "daw.track.list" in report["canonicalPublicCapabilityIdsCoveringPtsl"]
    assert "daw.track.mute.set" in report["canonicalPublicCapabilityIdsCoveringPtsl"]
    assert report["publicPtslSemanticCapabilityCount"] == 153
    assert len(report["publicPtslSemanticCapabilityIds"]) == 153
    assert "daw.sessionFile.createSession" in report["publicPtslSemanticCapabilityIds"]
    assert "daw.track.list" in report["publicPtslSemanticCapabilityIds"]
    assert report["catalogReachableViaPublicSemanticCapabilityCount"] == 153
    assert report["catalogUnreachableViaPublicSemanticCapability"] == []
    assert report["catalogReachableViaInternalCapabilityCount"] == 153
    assert report["catalogUnreachableViaInternalCapability"] == []
