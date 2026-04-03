from __future__ import annotations

import time
from types import SimpleNamespace

from presto.application.capabilities.registry import build_default_capability_registry
from presto.application.errors.normalizer import ErrorNormalizer
from presto.application.handlers.invoker import execute_capability
from presto.application.jobs.manager import InMemoryJobManager
from presto.application.service_container import ServiceContainer


class WorkflowExecutorFakeDaw:
    def __init__(self) -> None:
        self.connected = True
        self.saved = 0
        self.renames: list[tuple[str, str]] = []

    def is_connected(self) -> bool:
        return self.connected

    def save_session(self) -> None:
        self.saved += 1

    def rename_track(self, current_name: str, new_name: str) -> None:
        self.renames.append((current_name, new_name))


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
                    "usesCapability": "track.rename",
                    "input": {
                        "currentName": {"$ref": "input.sourceTrackName"},
                        "newName": {"$ref": "input.targetTrackName"},
                    },
                    "saveAs": "renameResult",
                },
                {
                    "stepId": "save_session",
                    "usesCapability": "session.save",
                    "input": {},
                },
            ],
        },
        "allowedCapabilities": ["track.rename", "session.save"],
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
                    "usesCapability": "track.rename",
                    "input": {
                        "currentName": "Lead Vox RAW",
                        "newName": "Lead Vox",
                    },
                },
                {
                    "stepId": "save_session",
                    "usesCapability": "session.save",
                    "input": {},
                },
            ],
        },
        "allowedCapabilities": ["track.rename"],
        "input": {},
    }

    try:
        execute_capability(services, "workflow.run.start", payload)
    except Exception as error:
        assert getattr(error, "code", None) == "VALIDATION_ERROR"
        assert getattr(error, "details", {}).get("field") == "allowedCapabilities"
        assert "session.save" in str(error)
    else:
        raise AssertionError("workflow.run.start should reject undeclared workflow capabilities")
