from __future__ import annotations

import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

from presto.application.capabilities.registry import build_default_capability_registry
from presto.application.errors.normalizer import ErrorNormalizer
from presto.application.handlers import invoker as invoker_module
from presto.application.handlers.invoker import execute_capability
from presto.application.jobs.manager import InMemoryJobManager
from presto.application.service_container import ServiceContainer


class WorkflowExecutorFakeDaw:
    def __init__(self) -> None:
        self.connected = True
        self.saved = 0
        self.renames: list[tuple[str, str]] = []
        self.colors: list[tuple[str, int]] = []
        self.imported_paths: list[str] = []
        self.ptsl_execute_calls: list[tuple[str, dict[str, object], str | None]] = []
        self.import_release_event = threading.Event()
        self.rename_release_event = threading.Event()
        self.block_after_import_count: int | None = None
        self.block_after_rename_count: int | None = None

    def is_connected(self) -> bool:
        return self.connected

    def save_session(self) -> None:
        self.saved += 1

    def rename_track(self, current_name: str, new_name: str) -> None:
        self.renames.append((current_name, new_name))
        if self.block_after_rename_count is not None and len(self.renames) > self.block_after_rename_count:
            self.rename_release_event.wait(timeout=5)

    def apply_track_color(self, track_name: str, color_slot: int) -> None:
        self.colors.append((track_name, color_slot))

    def import_audio_file(self, path: str, import_mode: str = "copy") -> str:
        _ = import_mode
        self.imported_paths.append(path)
        if self.block_after_import_count is not None and len(self.imported_paths) > self.block_after_import_count:
            self.import_release_event.wait(timeout=5)
        return Path(path).stem

    def execute_ptsl_command(
        self,
        command_name: str,
        payload: dict[str, object] | None = None,
        *,
        minimum_host_version: str | None = None,
    ) -> dict[str, object]:
        resolved_payload = dict(payload or {})
        self.ptsl_execute_calls.append((command_name, resolved_payload, minimum_host_version))
        return {
            "echo": resolved_payload,
            "minimumHostVersion": minimum_host_version,
        }


class RecordingLogger:
    def __init__(self) -> None:
        self.records: list[tuple[str, str, dict[str, object] | None]] = []

    def debug(self, message: str, meta: dict[str, object] | None = None) -> None:
        self.records.append(("debug", message, meta))

    def info(self, message: str, meta: dict[str, object] | None = None) -> None:
        self.records.append(("info", message, meta))

    def warn(self, message: str, meta: dict[str, object] | None = None) -> None:
        self.records.append(("warn", message, meta))

    def error(self, message: str, meta: dict[str, object] | None = None) -> None:
        self.records.append(("error", message, meta))


def _services() -> ServiceContainer:
    return ServiceContainer(
        capability_registry=build_default_capability_registry(),
        job_manager=InMemoryJobManager(),
        error_normalizer=ErrorNormalizer(),
        daw=WorkflowExecutorFakeDaw(),
    )


def test_workflow_run_start_executes_declarative_steps_and_exposes_terminal_job_result() -> None:
    services = _services()
    payload = {
        "pluginId": "official.import-workflow",
        "workflowId": "test.workflow.run",
        "definition": {
            "workflowId": "test.workflow.run",
            "version": "1.0.0",
            "inputSchemaId": "test.workflow.input.v1",
            "steps": [
                {
                    "stepId": "rename_track",
                    "usesCapability": "daw.track.rename",
                    "input": {
                        "currentName": {"$ref": "input.sourceTrackName"},
                        "newName": {"$ref": "input.targetTrackName"},
                    },
                    "saveAs": "renameResult",
                },
                {
                    "stepId": "save_session",
                    "usesCapability": "daw.session.save",
                    "input": {},
                },
            ],
        },
        "allowedCapabilities": ["daw.track.rename", "daw.session.save"],
        "input": {
            "sourceTrackName": "Lead Vox RAW",
            "targetTrackName": "Lead Vox",
        },
    }

    accepted = execute_capability(services, "workflow.run.start", payload)
    assert accepted["capability"] == "workflow.run.start"

    job_id = accepted["jobId"]
    deadline = time.time() + 3.0
    while time.time() < deadline:
        job = services.job_manager.get(job_id)
        if job.state in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(0.05)
    else:
        raise AssertionError("workflow job did not finish in time")

    record = services.job_manager.get(job_id)
    assert record.state == "succeeded"
    assert record.result["workflowId"] == "test.workflow.run"
    assert record.result["steps"]["renameResult"]["trackName"] == "Lead Vox"
    assert services.daw.renames == [("Lead Vox RAW", "Lead Vox")]
    assert services.daw.saved == 1


def test_workflow_run_start_can_use_generated_public_daw_semantic_capability_without_executor_changes() -> None:
    services = _services()
    payload = {
        "pluginId": "official.ptsl-workflow",
        "workflowId": "test.workflow.ptsl",
        "definition": {
            "workflowId": "test.workflow.ptsl",
            "version": "1.0.0",
            "inputSchemaId": "test.workflow.ptsl.v1",
            "steps": [
                {
                    "stepId": "read_tracks",
                    "usesCapability": "daw.sessionFile.createSession",
                    "input": {
                        "session_name": "Workflow Session",
                    },
                    "saveAs": "trackListResult",
                }
            ],
        },
        "allowedCapabilities": ["daw.sessionFile.createSession"],
        "input": {},
    }

    accepted = execute_capability(services, "workflow.run.start", payload)

    job_id = accepted["jobId"]
    deadline = time.time() + 3.0
    while time.time() < deadline:
        job = services.job_manager.get(job_id)
        if job.state in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(0.05)
    else:
        raise AssertionError("workflow job did not finish in time")

    record = services.job_manager.get(job_id)
    assert record.state == "succeeded"
    assert record.result["steps"]["trackListResult"]["command"]["commandName"] == "CId_CreateSession"
    assert services.daw.ptsl_execute_calls == [("CId_CreateSession", {"session_name": "Workflow Session"}, None)]


def test_workflow_run_start_rejects_steps_outside_allowed_capabilities() -> None:
    services = _services()
    payload = {
        "pluginId": "official.import-workflow",
        "workflowId": "test.workflow.run",
        "definition": {
            "workflowId": "test.workflow.run",
            "version": "1.0.0",
            "inputSchemaId": "test.workflow.input.v1",
            "steps": [
                {
                    "stepId": "rename_track",
                    "usesCapability": "daw.track.rename",
                    "input": {
                        "currentName": "Lead Vox RAW",
                        "newName": "Lead Vox",
                    },
                },
                {
                    "stepId": "save_session",
                    "usesCapability": "daw.session.save",
                    "input": {},
                },
            ],
        },
        "allowedCapabilities": ["daw.track.rename"],
        "input": {},
    }

    try:
        execute_capability(services, "workflow.run.start", payload)
    except Exception as error:
        assert getattr(error, "code", None) == "VALIDATION_ERROR"
        assert getattr(error, "details", {}).get("field") == "allowedCapabilities"
        assert "daw.session.save" in str(error)
    else:
        raise AssertionError("workflow.run.start should reject undeclared workflow capabilities")


def test_workflow_run_start_mirrors_child_job_progress_while_awaiting_import(tmp_path: Path) -> None:
    services = _services()
    services.daw.block_after_import_count = 1
    first_file = tmp_path / "Kick.wav"
    second_file = tmp_path / "Snare.wav"
    first_file.write_bytes(b"RIFF")
    second_file.write_bytes(b"RIFF")

    payload = {
        "pluginId": "official.import-workflow",
        "workflowId": "test.workflow.import",
        "definition": {
            "workflowId": "test.workflow.import",
            "version": "1.0.0",
            "inputSchemaId": "test.workflow.import.v1",
            "steps": [
                {
                    "stepId": "import_files",
                    "usesCapability": "daw.import.run.start",
                    "awaitJob": True,
                    "input": {
                        "folderPaths": {
                            "$ref": "input.folderPaths",
                        },
                        "orderedFilePaths": {
                            "$ref": "input.orderedFilePaths",
                        },
                    },
                    "saveAs": "importJob",
                }
            ],
        },
        "allowedCapabilities": ["daw.import.run.start"],
        "input": {
            "folderPaths": [str(tmp_path)],
            "orderedFilePaths": [str(first_file), str(second_file)],
        },
    }

    accepted = execute_capability(services, "workflow.run.start", payload)
    job_id = accepted["jobId"]

    deadline = time.time() + 3.0
    while time.time() < deadline:
        record = services.job_manager.get(job_id)
        if record.progress.current == 1 and record.progress.total == 2:
            break
        time.sleep(0.05)
    else:
        raise AssertionError(f"workflow parent job did not mirror child progress: {services.job_manager.get(job_id).progress}")

    services.daw.import_release_event.set()

    deadline = time.time() + 3.0
    while time.time() < deadline:
        record = services.job_manager.get(job_id)
        if record.state in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(0.05)
    else:
        raise AssertionError("workflow job did not finish in time after releasing import")

    record = services.job_manager.get(job_id)
    assert record.state == "succeeded"
    assert record.progress.current == 1
    assert record.progress.total == 1
    assert services.daw.imported_paths == [str(first_file), str(second_file)]


def test_workflow_cancel_cancels_awaited_child_job_handle(tmp_path: Path) -> None:
    services = _services()
    services.daw.block_after_import_count = 1
    first_file = tmp_path / "Kick.wav"
    second_file = tmp_path / "Snare.wav"
    first_file.write_bytes(b"RIFF")
    second_file.write_bytes(b"RIFF")

    accepted = execute_capability(
        services,
        "workflow.run.start",
        {
            "pluginId": "official.import-workflow",
            "workflowId": "test.workflow.cancel-child",
            "definition": {
                "workflowId": "test.workflow.cancel-child",
                "version": "1.0.0",
                "inputSchemaId": "test.workflow.import.v1",
                "steps": [
                    {
                        "stepId": "import_files",
                        "usesCapability": "daw.import.run.start",
                        "awaitJob": True,
                        "input": {
                            "folderPaths": {"$ref": "input.folderPaths"},
                            "orderedFilePaths": {"$ref": "input.orderedFilePaths"},
                        },
                    }
                ],
            },
            "allowedCapabilities": ["daw.import.run.start"],
            "input": {
                "folderPaths": [str(tmp_path)],
                "orderedFilePaths": [str(first_file), str(second_file)],
            },
        },
    )
    parent_job_id = accepted["jobId"]

    deadline = time.time() + 3.0
    child_job_id = ""
    while time.time() < deadline:
        child_jobs = [job for job in services.job_manager.list().jobs if job.capability == "daw.import.run.start"]
        if child_jobs and child_jobs[0].progress.current == 1:
            child_job_id = child_jobs[0].job_id
            break
        time.sleep(0.05)
    else:
        raise AssertionError("workflow child import job did not start")

    child_handle = services.job_handle_registry.get(child_job_id)
    assert child_handle is not None
    services.job_handle_registry.cancel(parent_job_id)

    deadline = time.time() + 3.0
    while time.time() < deadline:
        if services.job_manager.get(parent_job_id).state == "cancelled":
            break
        time.sleep(0.05)
    else:
        raise AssertionError("workflow parent job did not cancel")

    assert services.job_manager.get(child_job_id).state == "cancelled"
    assert child_handle.cancel_event.is_set() is True
    services.daw.import_release_event.set()


def test_workflow_run_start_advances_to_batched_post_import_stage_after_import_finishes(tmp_path: Path) -> None:
    services = _services()
    services.daw.block_after_import_count = 1
    services.daw.block_after_rename_count = 0
    first_file = tmp_path / "Kick.wav"
    second_file = tmp_path / "Snare.wav"
    first_file.write_bytes(b"RIFF")
    second_file.write_bytes(b"RIFF")

    payload = {
        "pluginId": "official.import-workflow",
        "workflowId": "test.workflow.import.batched",
        "definition": {
            "workflowId": "test.workflow.import.batched",
            "version": "1.0.0",
            "inputSchemaId": "test.workflow.import.v1",
            "steps": [
                {
                    "stepId": "import",
                    "usesCapability": "daw.import.run.start",
                    "awaitJob": True,
                    "input": {
                        "folderPaths": {"$ref": "input.folderPaths"},
                        "orderedFilePaths": {"$ref": "input.orderedFilePaths"},
                    },
                    "saveAs": "importJob",
                },
                {
                    "stepId": "rename",
                    "foreach": {
                        "items": {"$ref": "input.renameItems"},
                        "as": "item",
                    },
                    "steps": [
                        {
                            "stepId": "rename_track",
                            "usesCapability": "daw.track.rename",
                            "input": {
                                "currentName": {"$ref": "item.currentName"},
                                "newName": {"$ref": "item.newName"},
                            },
                        }
                    ],
                },
            ],
        },
        "allowedCapabilities": ["daw.import.run.start", "daw.track.rename"],
        "input": {
            "folderPaths": [str(tmp_path)],
            "orderedFilePaths": [str(first_file), str(second_file)],
            "renameItems": [
                {"currentName": "Kick", "newName": "Kick In"},
                {"currentName": "Snare", "newName": "Snare Top"},
            ],
        },
    }

    accepted = execute_capability(services, "workflow.run.start", payload)
    job_id = accepted["jobId"]

    deadline = time.time() + 3.0
    while time.time() < deadline:
        record = services.job_manager.get(job_id)
        if record.progress.phase == "import" and record.progress.current == 1 and record.progress.total == 2:
            break
        time.sleep(0.05)
    else:
        raise AssertionError(f"workflow parent job did not mirror import phase progress: {services.job_manager.get(job_id).progress}")

    services.daw.import_release_event.set()

    deadline = time.time() + 3.0
    while time.time() < deadline:
        record = services.job_manager.get(job_id)
        if record.progress.phase == "rename" and record.progress.total == 2:
            break
        time.sleep(0.05)
    else:
        raise AssertionError(f"workflow parent job did not advance to rename phase: {services.job_manager.get(job_id).progress}")

    services.daw.rename_release_event.set()

    deadline = time.time() + 3.0
    while time.time() < deadline:
        record = services.job_manager.get(job_id)
        if record.state in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(0.05)
    else:
        raise AssertionError("workflow job did not finish in time after releasing rename")

    record = services.job_manager.get(job_id)
    assert record.state == "succeeded"
    assert services.daw.renames == [("Kick", "Kick In"), ("Snare", "Snare Top")]
    assert record.result["metrics"] == {
        "schemaVersion": 1,
        "workflowId": "test.workflow.import.batched",
        "commandCounts": {
            "daw.import.run.start": 1,
            "daw.track.rename": 2,
        },
    }


def test_workflow_run_start_reports_only_successful_executed_workflow_commands(tmp_path: Path) -> None:
    services = _services()
    first_file = tmp_path / "Kick.wav"
    second_file = tmp_path / "Snare.wav"
    first_file.write_bytes(b"RIFF")
    second_file.write_bytes(b"RIFF")

    accepted = execute_capability(
        services,
        "workflow.run.start",
        {
            "pluginId": "official.import-workflow",
            "workflowId": "test.workflow.metrics",
            "definition": {
                "workflowId": "test.workflow.metrics",
                "version": "1.0.0",
                "inputSchemaId": "test.workflow.import.v1",
                "steps": [
                    {
                        "stepId": "import",
                        "usesCapability": "daw.import.run.start",
                        "awaitJob": True,
                        "input": {
                            "folderPaths": {"$ref": "input.folderPaths"},
                            "orderedFilePaths": {"$ref": "input.orderedFilePaths"},
                        },
                        "saveAs": "importJob",
                    },
                    {
                        "stepId": "rename",
                        "foreach": {
                            "items": {"$ref": "input.renameItems"},
                            "as": "item",
                        },
                        "steps": [
                            {
                                "stepId": "rename_track",
                                "usesCapability": "daw.track.rename",
                                "input": {
                                    "currentName": {"$ref": "item.currentName"},
                                    "newName": {"$ref": "item.newName"},
                                },
                            }
                        ],
                    },
                    {
                        "stepId": "save",
                        "when": {
                            "$ref": "input.shouldSave",
                            "equals": True,
                        },
                        "usesCapability": "daw.session.save",
                        "input": {},
                    },
                ],
            },
            "allowedCapabilities": ["daw.import.run.start", "daw.track.rename", "daw.session.save"],
            "input": {
                "folderPaths": [str(tmp_path)],
                "orderedFilePaths": [str(first_file), str(second_file)],
                "renameItems": [
                    {"currentName": "Kick", "newName": "Kick In"},
                    {"currentName": "Snare", "newName": "Snare Top"},
                ],
                "shouldSave": False,
            },
        },
    )

    deadline = time.time() + 3.0
    while time.time() < deadline:
        record = services.job_manager.get(accepted["jobId"])
        if record.state in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(0.05)
    else:
        raise AssertionError("workflow job did not finish in time")

    record = services.job_manager.get(accepted["jobId"])
    assert record.state == "succeeded"
    assert record.result["metrics"] == {
        "schemaVersion": 1,
        "workflowId": "test.workflow.metrics",
        "commandCounts": {
            "daw.import.run.start": 1,
            "daw.track.rename": 2,
        },
    }
    assert "daw.session.save" not in record.result["metrics"]["commandCounts"]


def test_workflow_run_start_propagates_request_id_to_nested_capability(monkeypatch: pytest.MonkeyPatch) -> None:
    services = _services()
    seen_request_ids: list[str] = []

    def _record_handler(ctx, payload):
        seen_request_ids.append(ctx.request_id)
        return {"ok": True, "payload": payload}

    monkeypatch.setitem(invoker_module.HANDLER_BINDINGS, "system.health", _record_handler)

    accepted = execute_capability(
        services,
        "workflow.run.start",
        {
            "pluginId": "official.import-workflow",
            "workflowId": "test.workflow.request-id",
            "definition": {
                "workflowId": "test.workflow.request-id",
                "version": "1.0.0",
                "inputSchemaId": "test.workflow.input.v1",
                "steps": [
                    {
                        "stepId": "probe",
                        "usesCapability": "system.health",
                        "input": {},
                        "saveAs": "probe",
                    }
                ],
            },
            "allowedCapabilities": ["system.health"],
            "input": {},
        },
        request_id="req-workflow-parent",
    )

    deadline = time.time() + 3.0
    while time.time() < deadline:
        if services.job_manager.get(accepted["jobId"]).state in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(0.05)
    else:
        raise AssertionError("workflow job did not finish in time")

    assert seen_request_ids == ["req-workflow-parent"]
    assert hasattr(services, "workflow_run_handles") is False
    assert hasattr(services, "workflow_run_handles_lock") is False


def test_execute_capability_logs_atomic_capability_lifecycle(monkeypatch: pytest.MonkeyPatch) -> None:
    services = _services()
    logger = RecordingLogger()
    services.logger = logger

    def _record_handler(ctx, payload):
        return {"requestId": ctx.request_id, "payload": payload}

    monkeypatch.setitem(invoker_module.HANDLER_BINDINGS, "system.health", _record_handler)

    result = execute_capability(
        services,
        "system.health",
        {"probe": True},
        request_id="req-exec-log-1",
    )

    assert result == {"requestId": "req-exec-log-1", "payload": {"probe": True}}
    assert logger.records == [
        (
            "info",
            "capability.invoke.start",
            {
                "capability": "system.health",
                "requestId": "req-exec-log-1",
                "payload": {"probe": True},
            },
        ),
        (
            "info",
            "capability.invoke.succeeded",
            {
                "capability": "system.health",
                "requestId": "req-exec-log-1",
                "result": {"requestId": "req-exec-log-1", "payload": {"probe": True}},
            },
        ),
    ]


def test_workflow_run_start_logs_workflow_lifecycle_and_steps() -> None:
    services = _services()
    logger = RecordingLogger()
    services.logger = logger
    payload = {
        "pluginId": "official.import-workflow",
        "workflowId": "test.workflow.log",
        "definition": {
            "workflowId": "test.workflow.log",
            "version": "1.0.0",
            "inputSchemaId": "test.workflow.input.v1",
            "steps": [
                {
                    "stepId": "rename_track",
                    "usesCapability": "daw.track.rename",
                    "input": {
                        "currentName": "Lead Vox RAW",
                        "newName": "Lead Vox",
                    },
                }
            ],
        },
        "allowedCapabilities": ["daw.track.rename"],
        "input": {},
    }

    accepted = execute_capability(services, "workflow.run.start", payload, request_id="req-workflow-log-1")
    deadline = time.time() + 3.0
    while time.time() < deadline:
        if services.job_manager.get(accepted["jobId"]).state in {"succeeded", "failed", "cancelled"}:
            break
        time.sleep(0.05)
    else:
        raise AssertionError("workflow job did not finish in time")

    info_records = [record for record in logger.records if record[0] == "info"]
    assert any(
        message == "workflow.run.accepted"
        and meta == {
            "jobId": accepted["jobId"],
            "pluginId": "official.import-workflow",
            "requestId": "req-workflow-log-1",
            "workflowId": "test.workflow.log",
        }
        for _, message, meta in info_records
    )
    assert any(
        message == "workflow.step.started"
        and meta == {
            "capability": "daw.track.rename",
            "jobId": accepted["jobId"],
            "requestId": "req-workflow-log-1",
            "stepId": "rename_track",
            "workflowId": "test.workflow.log",
        }
        for _, message, meta in info_records
    )
    assert any(
        message == "workflow.run.succeeded"
        and meta == {
            "jobId": accepted["jobId"],
            "requestId": "req-workflow-log-1",
            "workflowId": "test.workflow.log",
        }
        for _, message, meta in info_records
    )
