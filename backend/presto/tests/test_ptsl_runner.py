from __future__ import annotations

import pytest

from presto.domain.errors import PrestoError
from presto.integrations.daw.ptsl_runner import PtslCommandCatalogEntry, PtslCommandRunner


class FakeClient:
    def __init__(self) -> None:
        self.run_calls = []
        self.run_command_calls = []

    def run(self, operation) -> None:
        self.run_calls.append(operation)
        operation.response = {"mode": "op"}

    def run_command(self, command_id: int, request: dict[str, object]):
        self.run_command_calls.append((command_id, dict(request)))
        return {"mode": "raw", "command_id": command_id}


class FakeEngine:
    def __init__(self) -> None:
        self.client = FakeClient()


def _runner(entries: list[PtslCommandCatalogEntry]) -> PtslCommandRunner:
    return PtslCommandRunner(entries)


def test_runner_uses_py_ptsl_operation_when_available() -> None:
    engine = FakeEngine()
    runner = _runner(
        [
            PtslCommandCatalogEntry(
                command_name="CId_SelectTracksByName",
                command_id=73,
                request_message="SelectTracksByNameRequestBody",
                response_message="SelectTracksByNameResponseBody",
                has_py_ptsl_op=True,
                category="track",
                introduced_version="2023.09.0",
            )
        ]
    )

    response = runner.run(engine, "CId_SelectTracksByName", {"track_names": ["Kick"]}, capability="track.select")

    assert response == {"mode": "op"}
    assert len(engine.client.run_calls) == 1
    assert engine.client.run_command_calls == []


def test_runner_falls_back_to_raw_run_command_when_operation_wrapper_is_missing() -> None:
    engine = FakeEngine()
    runner = _runner(
        [
            PtslCommandCatalogEntry(
                command_name="CId_GetExportMixSourceList",
                command_id=128,
                request_message="GetExportMixSourceListRequestBody",
                response_message="GetExportMixSourceListResponseBody",
                has_py_ptsl_op=False,
                category="export",
                introduced_version="2025.10.0",
            )
        ]
    )

    response = runner.run(engine, "CId_GetExportMixSourceList", {"type": "EMSType_Output"}, capability="export.mixWithSource")

    assert response == {"mode": "raw", "command_id": 128}
    assert engine.client.run_calls == []
    assert engine.client.run_command_calls == [(128, {"type": "EMSType_Output"})]


def test_runner_rejects_unknown_command_names() -> None:
    runner = _runner([])

    with pytest.raises(PrestoError) as exc_info:
        runner.run(FakeEngine(), "CId_DoesNotExist", {}, capability="track.list")

    assert exc_info.value.code == "PTSL_COMMAND_UNAVAILABLE"


def test_runner_enforces_minimum_host_version() -> None:
    engine = FakeEngine()
    runner = PtslCommandRunner(
        [
            PtslCommandCatalogEntry(
                command_name="CId_SetTrackRecordEnableState",
                command_id=88,
                request_message="SetTrackRecordEnableStateRequestBody",
                response_message="SetTrackRecordEnableStateResponseBody",
                has_py_ptsl_op=True,
                category="track",
                introduced_version="2025.10.0",
            )
        ],
        host_version="2025.06.0",
    )

    with pytest.raises(PrestoError) as exc_info:
        runner.run(
            engine,
            "CId_SetTrackRecordEnableState",
            {"track_names": ["Kick"], "enabled": True},
            capability="track.recordEnable.set",
            minimum_host_version="2025.10.0",
        )

    assert exc_info.value.code == "PTSL_VERSION_UNSUPPORTED"
