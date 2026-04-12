from __future__ import annotations

from datetime import datetime, timezone
import threading
import time
from typing import Any, Callable
from uuid import uuid4

from ...domain.ports import CapabilityExecutionContext
from ..service_container import ServiceContainer
from ..runtime_state import ThreadedJobHandle
from ...domain.capabilities import DEFAULT_DAW_TARGET
from ...domain.errors import PrestoError, PrestoErrorPayload, PrestoValidationError
from ...domain.jobs import JobProgress, JobRecord
from .common import runtime_from_context


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _validation_error(message: str, *, field: str) -> PrestoValidationError:
    return PrestoValidationError(
        message,
        details={
            "rawCode": "VALIDATION_ERROR",
            "rawMessage": message,
            "field": field,
        },
        capability="workflow.run.start",
    )


def _run_handles_set(services: ServiceContainer, job_id: str, handle: ThreadedJobHandle) -> None:
    registry = services.job_handle_registry
    if registry is None:
        raise RuntimeError("job_handle_registry_not_configured")
    registry.register(job_id, handle)


def _run_handles_pop(services: ServiceContainer, job_id: str) -> ThreadedJobHandle | None:
    registry = services.job_handle_registry
    if registry is None:
        raise RuntimeError("job_handle_registry_not_configured")
    handle = registry.pop(job_id)
    return handle if isinstance(handle, ThreadedJobHandle) else None


def cancel_workflow_run(services: ServiceContainer, job_id: str) -> None:
    registry = services.job_handle_registry
    if registry is None:
        raise RuntimeError("job_handle_registry_not_configured")
    registry.cancel(job_id)


def _job_record_payload(record: JobRecord) -> dict[str, Any]:
    return {
        "jobId": record.job_id,
        "capability": record.capability,
        "targetDaw": record.target_daw,
        "state": record.state,
        "progress": {
            "phase": record.progress.phase,
            "current": record.progress.current,
            "total": record.progress.total,
            "percent": record.progress.percent,
            "message": record.progress.message,
        },
        "metadata": record.metadata,
        "result": record.result,
        "error": record.error,
        "createdAt": record.created_at,
        "startedAt": record.started_at,
        "finishedAt": record.finished_at,
    }


def _record_successful_command(command_counts: dict[str, int], capability_id: str) -> None:
    command_counts[capability_id] = command_counts.get(capability_id, 0) + 1


def _normalize_error(services: ServiceContainer, error: Exception, *, capability_id: str) -> PrestoErrorPayload:
    payload = services.error_normalizer.normalize(
        error,
        capability=capability_id,
        adapter=str(getattr(services, "target_daw", DEFAULT_DAW_TARGET)),
    )
    details = dict(payload.details or {})
    details.setdefault("rawCode", payload.code)
    details.setdefault("rawMessage", payload.message)
    return PrestoErrorPayload(
        code=payload.code,
        message=payload.message,
        details=details,
        source=payload.source,
        retryable=payload.retryable,
        capability=payload.capability,
        adapter=payload.adapter,
    )


def _resolve_ref(path: str, context: dict[str, Any]) -> Any:
    current: Any = context
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
            continue
        raise _validation_error(f"Unknown workflow reference: {path}", field="definition")
    return current


def _resolve_template(value: Any, context: dict[str, Any]) -> Any:
    if isinstance(value, dict):
        if set(value.keys()) == {"$ref"} and isinstance(value["$ref"], str):
            return _resolve_ref(value["$ref"], context)
        return {key: _resolve_template(item, context) for key, item in value.items()}
    if isinstance(value, list):
        return [_resolve_template(item, context) for item in value]
    return value


def _should_run_step(step: dict[str, Any], context: dict[str, Any]) -> bool:
    when = step.get("when")
    if when is None:
        return True
    if not isinstance(when, dict) or not isinstance(when.get("$ref"), str):
        raise _validation_error("workflow step when must provide a $ref condition.", field="definition")
    return _resolve_ref(when["$ref"], context) == when.get("equals")


def _await_child_job(
    services: ServiceContainer,
    parent_job_id: str,
    child_job_id: str,
    *,
    phase: str,
    cancel_event: threading.Event,
) -> dict[str, Any]:
    while True:
        if cancel_event.is_set():
            try:
                services.job_manager.cancel(child_job_id)
            except Exception:
                pass
            raise PrestoError("WORKFLOW_CANCELLED", "Workflow execution cancelled.", capability="workflow.run.start")

        child_job = services.job_manager.get(child_job_id)
        parent_job = services.job_manager.get(parent_job_id)
        if parent_job.state in {"queued", "running"}:
            parent_job.state = "running"
            parent_job.started_at = parent_job.started_at or _utc_now()
            parent_job.progress = JobProgress(
                phase=phase,
                current=child_job.progress.current,
                total=child_job.progress.total,
                percent=child_job.progress.percent,
                message=child_job.progress.message,
            )
            services.job_manager.upsert(parent_job)
        if child_job.state == "succeeded":
            return _job_record_payload(child_job)
        if child_job.state == "failed":
            message = child_job.error.message if child_job.error is not None else f"Child job failed: {child_job_id}"
            raise PrestoError("WORKFLOW_STEP_FAILED", message, capability="workflow.run.start")
        if child_job.state == "cancelled":
            raise PrestoError("WORKFLOW_STEP_CANCELLED", f"Child job cancelled: {child_job_id}", capability="workflow.run.start")
        time.sleep(0.05)


def _execute_steps(
    services: ServiceContainer,
    parent_job_id: str,
    steps: list[dict[str, Any]],
    *,
    context: dict[str, Any],
    command_counts: dict[str, int],
    invoke_capability: Callable[[str, dict[str, Any]], Any],
    cancel_event: threading.Event,
    progress_phase: str | None = None,
    report_step_progress: bool = True,
) -> dict[str, Any]:
    for step in steps:
        if cancel_event.is_set():
            raise PrestoError("WORKFLOW_CANCELLED", "Workflow execution cancelled.", capability="workflow.run.start")

        if not _should_run_step(step, context):
            continue

        step_id = str(step.get("stepId", "")).strip() or "running"
        effective_phase = progress_phase or step_id
        parent_job = services.job_manager.get(parent_job_id)

        if isinstance(step.get("foreach"), dict):
            foreach = step["foreach"]
            items = _resolve_template(foreach.get("items"), context)
            if not isinstance(items, list):
                raise _validation_error("workflow foreach items must resolve to a list.", field="definition")
            item_name = str(foreach.get("as", "")).strip()
            if not item_name:
                raise _validation_error("workflow foreach requires an as binding.", field="definition")
            nested_steps = step.get("steps")
            if not isinstance(nested_steps, list):
                raise _validation_error("workflow foreach requires nested steps.", field="definition")
            total_items = max(len(items), 1)
            parent_job.state = "running"
            parent_job.started_at = parent_job.started_at or _utc_now()
            parent_job.progress = JobProgress(
                phase=effective_phase,
                current=0,
                total=total_items,
                percent=0.0,
                message=f"Workflow step {effective_phase} is running.",
            )
            services.job_manager.upsert(parent_job)
            for index, item in enumerate(items, start=1):
                context[item_name] = item
                _execute_steps(
                    services,
                    parent_job_id,
                    [nested_step for nested_step in nested_steps if isinstance(nested_step, dict)],
                    context=context,
                    command_counts=command_counts,
                    invoke_capability=invoke_capability,
                    cancel_event=cancel_event,
                    progress_phase=effective_phase,
                    report_step_progress=False,
                )
                parent_job = services.job_manager.get(parent_job_id)
                if parent_job.state in {"queued", "running"}:
                    parent_job.state = "running"
                    parent_job.started_at = parent_job.started_at or _utc_now()
                    parent_job.progress = JobProgress(
                        phase=effective_phase,
                        current=index,
                        total=total_items,
                        percent=round((index / total_items) * 100, 1),
                        message=f"Workflow step {effective_phase} is running.",
                    )
                    services.job_manager.upsert(parent_job)
            context.pop(item_name, None)
            continue

        capability_id = str(step.get("usesCapability", "")).strip()
        if not capability_id:
            raise _validation_error("workflow step usesCapability is required.", field="definition")

        payload = _resolve_template(step.get("input", {}), context)
        if not isinstance(payload, dict):
            raise _validation_error("workflow step input must resolve to an object.", field="definition")

        if report_step_progress:
            parent_job.state = "running"
            parent_job.started_at = parent_job.started_at or _utc_now()
            parent_job.progress = JobProgress(
                phase=effective_phase,
                current=0,
                total=1,
                percent=0.0,
                message=f"Workflow step {effective_phase} is running.",
            )
            services.job_manager.upsert(parent_job)
        result = invoke_capability(capability_id, payload)

        if step.get("awaitJob") is True:
            if not isinstance(result, dict) or not isinstance(result.get("jobId"), str):
                raise _validation_error("awaitJob steps must return a jobId.", field="definition")
            result = _await_child_job(services, parent_job_id, result["jobId"], phase=effective_phase, cancel_event=cancel_event)
        _record_successful_command(command_counts, capability_id)

        if report_step_progress:
            parent_job = services.job_manager.get(parent_job_id)
            if parent_job.state in {"queued", "running"}:
                parent_job.state = "running"
                parent_job.started_at = parent_job.started_at or _utc_now()
                parent_job.progress = JobProgress(
                    phase=effective_phase,
                    current=1,
                    total=1,
                    percent=100.0,
                    message=f"Workflow step {effective_phase} completed.",
                )
                services.job_manager.upsert(parent_job)

        save_as = str(step.get("saveAs", "")).strip()
        if save_as:
            context[save_as] = result

    return context


def _collect_used_capabilities(steps: list[dict[str, Any]], collected: set[str] | None = None) -> set[str]:
    resolved = collected or set()
    for step in steps:
        capability_id = step.get("usesCapability")
        if isinstance(capability_id, str) and capability_id.strip():
            resolved.add(capability_id.strip())
        nested_steps = step.get("steps")
        if isinstance(nested_steps, list):
            _collect_used_capabilities([item for item in nested_steps if isinstance(item, dict)], resolved)
    return resolved


def _run_workflow_job(
    services: ServiceContainer,
    job_id: str,
    definition: dict[str, Any],
    workflow_input: dict[str, Any],
    *,
    invoke_capability: Callable[[str, dict[str, Any]], Any],
    cancel_event: threading.Event,
) -> None:
    job = services.job_manager.get(job_id)
    try:
        job.state = "running"
        job.started_at = job.started_at or _utc_now()
        job.progress = JobProgress(phase="running", current=0, total=max(len(definition["steps"]), 1), percent=0.0, message="Workflow is running.")
        services.job_manager.upsert(job)

        context: dict[str, Any] = {
            "input": workflow_input,
        }
        command_counts: dict[str, int] = {}
        final_context = _execute_steps(
            services,
            job_id,
            [step for step in definition["steps"] if isinstance(step, dict)],
            context=context,
            command_counts=command_counts,
            invoke_capability=invoke_capability,
            cancel_event=cancel_event,
        )

        job.state = "succeeded"
        job.progress = JobProgress(
            phase="succeeded",
            current=max(len(definition["steps"]), 1),
            total=max(len(definition["steps"]), 1),
            percent=100.0,
            message="Workflow completed.",
        )
        job.result = {
            "workflowId": definition["workflowId"],
            "steps": {key: value for key, value in final_context.items() if key != "input"},
            "metrics": {
                "schemaVersion": 1,
                "workflowId": definition["workflowId"],
                "commandCounts": command_counts,
            },
        }
        job.finished_at = _utc_now()
        services.job_manager.upsert(job)
    except Exception as error:
        normalized_error = _normalize_error(services, error, capability_id="workflow.run.start")
        job = services.job_manager.get(job_id)
        job.state = "failed" if normalized_error.code != "WORKFLOW_CANCELLED" else "cancelled"
        job.progress = JobProgress(
            phase=job.state,
            current=job.progress.current,
            total=job.progress.total,
            percent=job.progress.percent,
            message=normalized_error.message,
        )
        job.error = normalized_error
        job.finished_at = _utc_now()
        services.job_manager.upsert(job)
    finally:
        _run_handles_pop(services, job_id)


def start_workflow_run(
    services: ServiceContainer,
    payload: dict[str, Any],
    *,
    invoke_capability: Callable[[str, dict[str, Any]], Any],
) -> dict[str, Any]:
    plugin_id = str(payload.get("pluginId", "")).strip()
    if not plugin_id:
        raise _validation_error("pluginId is required.", field="pluginId")

    workflow_id = str(payload.get("workflowId", "")).strip()
    if not workflow_id:
        raise _validation_error("workflowId is required.", field="workflowId")

    definition = payload.get("definition")
    if not isinstance(definition, dict):
        raise _validation_error("definition is required.", field="definition")

    if str(definition.get("workflowId", "")).strip() != workflow_id:
        raise _validation_error("definition.workflowId must match workflowId.", field="definition.workflowId")

    steps = definition.get("steps")
    if not isinstance(steps, list) or not steps:
        raise _validation_error("definition.steps is required.", field="definition.steps")

    allowed_capabilities = payload.get("allowedCapabilities")
    if not isinstance(allowed_capabilities, list) or not allowed_capabilities:
        raise _validation_error("allowedCapabilities is required.", field="allowedCapabilities")
    if not all(isinstance(item, str) and item.strip() for item in allowed_capabilities):
        raise _validation_error("allowedCapabilities must be a non-empty string array.", field="allowedCapabilities")
    allowed_capability_set = {item.strip() for item in allowed_capabilities}
    used_capabilities = _collect_used_capabilities([step for step in steps if isinstance(step, dict)])
    undeclared_capabilities = sorted(
        capability_id for capability_id in used_capabilities if capability_id not in allowed_capability_set
    )
    if undeclared_capabilities:
        joined = ", ".join(undeclared_capabilities)
        raise _validation_error(
            f"workflow definition uses capabilities outside allowedCapabilities: {joined}",
            field="allowedCapabilities",
        )

    workflow_input = payload.get("input")
    if workflow_input is None:
        workflow_input = {}
    if not isinstance(workflow_input, dict):
        raise _validation_error("input must be an object.", field="input")

    job = JobRecord(
        job_id=f"workflow-{uuid4().hex[:12]}",
        capability="workflow.run.start",
        target_daw=str(getattr(services, "target_daw", DEFAULT_DAW_TARGET)),
        state="queued",
        progress=JobProgress(phase="queued", current=0, total=max(len(steps), 1), percent=0.0, message="Workflow queued."),
        metadata={"pluginId": plugin_id, "workflowId": workflow_id},
        result={"workflowId": workflow_id, "steps": {}},
        created_at=_utc_now(),
    )
    services.job_manager.upsert(job)

    cancel_event = threading.Event()
    worker = threading.Thread(
        target=_run_workflow_job,
        args=(services, job.job_id, definition, workflow_input),
        kwargs={"invoke_capability": invoke_capability, "cancel_event": cancel_event},
        name=f"presto-workflow-run-{job.job_id}",
        daemon=True,
    )
    _run_handles_set(
        services,
        job.job_id,
        ThreadedJobHandle(cancel_event=cancel_event, worker=worker, capability="workflow.run.start"),
    )
    worker.start()
    return {"jobId": job.job_id, "capability": "workflow.run.start", "state": "queued"}


def start_workflow_run_payload(
    ctx: CapabilityExecutionContext,
    payload: dict[str, Any],
    *,
    invoke_capability: Callable[[str, dict[str, Any]], Any],
) -> dict[str, Any]:
    return start_workflow_run(
        runtime_from_context(ctx),
        payload,
        invoke_capability=invoke_capability,
    )
