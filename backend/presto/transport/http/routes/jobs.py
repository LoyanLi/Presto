from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Query, Request

from ....application.jobs.cancellation import cancel_managed_job
from ....application.service_container import ServiceContainer
from ....domain.jobs import JobState, JobsListRequest
from ..schemas.jobs import JobActionResponseSchema, JobDetailResponseSchema, JobListResponseSchema, JobSchema


router = APIRouter(tags=["jobs"])


def _services(request: Request) -> ServiceContainer:
    return request.app.state.services


@router.get("/jobs/{job_id}", response_model=JobDetailResponseSchema)
def get_job(job_id: str, request: Request) -> JobDetailResponseSchema:
    services = _services(request)
    return JobDetailResponseSchema(job=JobSchema.from_record(services.job_manager.get(job_id)))


@router.get("/jobs", response_model=JobListResponseSchema)
def list_jobs(
    request: Request,
    states: Optional[List[JobState]] = Query(default=None),
    capabilities: Optional[List[str]] = Query(default=None),
    limit: Optional[int] = Query(default=None, ge=0),
) -> JobListResponseSchema:
    services = _services(request)
    job_list = services.job_manager.list(
        JobsListRequest(
            states=tuple(states) if states else None,
            capabilities=tuple(capabilities) if capabilities else None,
            limit=limit,
        )
    )
    return JobListResponseSchema(
        jobs=[JobSchema.from_record(job) for job in job_list.jobs],
        total_count=job_list.total_count,
    )


@router.post("/jobs/{job_id}/cancel", response_model=JobActionResponseSchema)
def cancel_job(job_id: str, request: Request) -> JobActionResponseSchema:
    services = _services(request)
    result = cancel_managed_job(
        job_manager=services.job_manager,
        job_handle_registry=services.job_handle_registry,
        daw=services.daw,
        job_id=job_id,
    )
    return JobActionResponseSchema(job_id=result.job_id, action="cancel", success=result.cancelled)


@router.delete("/jobs/{job_id}", response_model=JobActionResponseSchema)
def delete_job(job_id: str, request: Request) -> JobActionResponseSchema:
    services = _services(request)
    result = services.job_manager.delete(job_id)
    return JobActionResponseSchema(job_id=result.job_id, action="delete", success=result.deleted)
