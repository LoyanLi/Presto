from __future__ import annotations

from dataclasses import asdict
from typing import Any

from .common import validation_error
from .import_workflow import cancel_job_run as cancel_import_or_export_job_run
from .workflow_executor import cancel_workflow_run
from ..service_container import ServiceContainer
from ...domain.errors import PrestoErrorPayload
from ...domain.jobs import JobRecord, JobsCreateRequest, JobsListRequest, JobsUpdateRequest


def job_record_payload(record: JobRecord) -> dict[str, Any]:
    data = asdict(record)
    return {
        "jobId": data["job_id"],
        "capability": data["capability"],
        "targetDaw": data["target_daw"],
        "state": data["state"],
        "progress": data["progress"],
        "metadata": data["metadata"],
        "result": data["result"],
        "error": data["error"],
        "createdAt": data["created_at"],
        "startedAt": data["started_at"],
        "finishedAt": data["finished_at"],
    }


def parse_job_list_filter(payload: dict[str, Any]) -> JobsListRequest:
    states = payload.get("states")
    capabilities = payload.get("capabilities")
    limit = payload.get("limit")

    return JobsListRequest(
        states=tuple(str(state) for state in states) if isinstance(states, list) else None,
        capabilities=tuple(str(capability) for capability in capabilities) if isinstance(capabilities, list) else None,
        limit=int(limit) if limit is not None else None,
    )


def get_job_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    job_id = str(payload.get("jobId", ""))
    return {"job": job_record_payload(services.job_manager.get(job_id))}


def list_jobs_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    job_list = services.job_manager.list(parse_job_list_filter(payload))
    return {
        "jobs": [job_record_payload(job) for job in job_list.jobs],
        "totalCount": job_list.total_count,
    }


def cancel_job_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    job_id = str(payload.get("jobId", ""))
    result = services.job_manager.cancel(job_id)
    cancel_import_or_export_job_run(services, job_id)
    cancel_workflow_run(services, job_id)
    return {"cancelled": result.cancelled, "jobId": result.job_id}


def delete_job_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    job_id = str(payload.get("jobId", ""))
    result = services.job_manager.delete(job_id)
    return {"deleted": result.deleted, "jobId": result.job_id}


def parse_job_state(payload: dict[str, Any], *, capability: str) -> str | None:
    state = payload.get("state")
    if state is None:
        return None
    state_text = str(state).strip()
    if state_text not in {"queued", "running", "succeeded", "failed", "cancelled"}:
        raise validation_error(
            "state must be one of queued/running/succeeded/failed/cancelled.",
            field="state",
            capability=capability,
        )
    return state_text


def parse_job_progress(payload: dict[str, Any], *, capability: str) -> dict[str, Any] | None:
    progress = payload.get("progress")
    if progress is None:
        return None
    if not isinstance(progress, dict):
        raise validation_error("progress must be an object.", field="progress", capability=capability)
    resolved = dict(progress)
    for key in ("current", "total"):
        if key in resolved and resolved[key] is not None:
            raw_value = resolved[key]
            if isinstance(raw_value, bool):
                raise validation_error(
                    f"progress.{key} must be an integer.",
                    field=f"progress.{key}",
                    capability=capability,
                )
            try:
                resolved[key] = int(raw_value)
            except (TypeError, ValueError) as exc:
                raise validation_error(
                    f"progress.{key} must be an integer.",
                    field=f"progress.{key}",
                    capability=capability,
                ) from exc
    if "percent" in resolved and resolved["percent"] is not None:
        raw_percent = resolved["percent"]
        if isinstance(raw_percent, bool):
            raise validation_error(
                "progress.percent must be a number.",
                field="progress.percent",
                capability=capability,
            )
        try:
            resolved["percent"] = float(raw_percent)
        except (TypeError, ValueError) as exc:
            raise validation_error(
                "progress.percent must be a number.",
                field="progress.percent",
                capability=capability,
            ) from exc
    return resolved


def parse_job_error(payload: dict[str, Any], *, capability: str) -> PrestoErrorPayload | None:
    error = payload.get("error")
    if error is None:
        return None
    if not isinstance(error, dict):
        raise validation_error("error must be an object.", field="error", capability=capability)
    code = str(error.get("code", "")).strip()
    message = str(error.get("message", "")).strip()
    if not code:
        raise validation_error("error.code is required.", field="error.code", capability=capability)
    if not message:
        raise validation_error("error.message is required.", field="error.message", capability=capability)
    return PrestoErrorPayload(
        code=code,
        message=message,
        details=error.get("details"),
        source=str(error.get("source", "runtime")),
        retryable=bool(error.get("retryable", False)),
        capability=str(error.get("capability")) if error.get("capability") is not None else None,
        adapter=str(error.get("adapter")) if error.get("adapter") is not None else None,
    )


def create_job_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "jobs.create"
    job_capability = str(payload.get("capability", "")).strip()
    if not job_capability:
        raise validation_error("capability is required.", field="capability", capability=capability_id)

    target_daw = str(payload.get("targetDaw", "")).strip()
    if not target_daw:
        raise validation_error("targetDaw is required.", field="targetDaw", capability=capability_id)

    state = parse_job_state(payload, capability=capability_id) or "queued"
    progress = parse_job_progress(payload, capability=capability_id)
    metadata_payload = payload.get("metadata")
    metadata = metadata_payload if isinstance(metadata_payload, dict) else None
    error = parse_job_error(payload, capability=capability_id)
    started_at = payload.get("startedAt")
    finished_at = payload.get("finishedAt")

    response = services.job_manager.create(
        JobsCreateRequest(
            capability=job_capability,
            target_daw=target_daw,
            state=state,
            progress=progress,
            metadata=metadata,
            result=payload.get("result"),
            error=error,
            started_at=str(started_at) if started_at is not None else None,
            finished_at=str(finished_at) if finished_at is not None else None,
        )
    )
    return {"job": job_record_payload(response.job)}


def update_job_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "jobs.update"
    job_id = str(payload.get("jobId", "")).strip()
    if not job_id:
        raise validation_error("jobId is required.", field="jobId", capability=capability_id)

    state = parse_job_state(payload, capability=capability_id)
    progress_payload = parse_job_progress(payload, capability=capability_id)
    error_payload = parse_job_error(payload, capability=capability_id)
    metadata_payload = payload.get("metadata")
    metadata = metadata_payload if isinstance(metadata_payload, dict) else None
    started_at = payload.get("startedAt")
    finished_at = payload.get("finishedAt")
    result = payload.get("result") if "result" in payload else None

    response = services.job_manager.update(
        JobsUpdateRequest(
            job_id=job_id,
            state=state,
            progress=progress_payload,
            metadata=metadata,
            result=result,
            error=error_payload,
            started_at=str(started_at) if started_at is not None else None,
            finished_at=str(finished_at) if finished_at is not None else None,
        )
    )
    return {"job": job_record_payload(response.job)}
