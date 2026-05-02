from __future__ import annotations

from copy import deepcopy
from collections import OrderedDict
from collections.abc import Iterable
from datetime import datetime, timezone
from threading import RLock
from uuid import uuid4

from ...domain.errors import JobNotFoundError, JobNotRunningError
from ...domain.jobs import (
    JobManagerProtocol,
    JobProgress,
    JobRecord,
    JobState,
    JobsCancelResponse,
    JobsCreateRequest,
    JobsCreateResponse,
    JobsDeleteResponse,
    JobsListRequest,
    JobsListResponse,
    JobsUpdateRequest,
    JobsUpdateResponse,
)


TERMINAL_STATES: set[JobState] = {"succeeded", "failed", "cancelled"}


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _as_int(value: object, *, default: int) -> int:
    if value is None:
        return default
    return int(value)


def _as_percent(value: object, *, current: int, total: int, default: float) -> float:
    if value is not None:
        return float(value)
    if total > 0:
        return (float(current) / float(total)) * 100.0
    return default


def _resolve_progress(
    current: JobProgress | None,
    payload: dict[str, object] | None,
    *,
    state: JobState | None = None,
) -> JobProgress:
    current_value = current.current if current is not None else 0
    total_value = current.total if current is not None else 0
    percent_value = current.percent if current is not None else 0.0
    phase_value = current.phase if current is not None else "queued"
    message_value = current.message if current is not None else None

    progress = payload or {}
    current_value = _as_int(progress.get("current"), default=current_value)
    total_value = _as_int(progress.get("total"), default=total_value)
    percent_value = _as_percent(progress.get("percent"), current=current_value, total=total_value, default=percent_value)
    if "phase" in progress:
        phase_value = str(progress.get("phase") or "").strip() or phase_value
    elif state is not None:
        phase_value = state
    if "message" in progress:
        raw_message = progress.get("message")
        message_value = None if raw_message is None else str(raw_message)

    return JobProgress(
        phase=phase_value,
        current=current_value,
        total=total_value,
        percent=percent_value,
        message=message_value,
    )


def _clone_job_record(job: JobRecord) -> JobRecord:
    return JobRecord(
        job_id=job.job_id,
        capability=job.capability,
        target_daw=job.target_daw,
        state=job.state,
        progress=JobProgress(
            phase=job.progress.phase,
            current=job.progress.current,
            total=job.progress.total,
            percent=job.progress.percent,
            message=job.progress.message,
        ),
        metadata=deepcopy(job.metadata),
        result=deepcopy(job.result),
        error=deepcopy(job.error),
        created_at=job.created_at,
        started_at=job.started_at,
        finished_at=job.finished_at,
    )


class InMemoryJobManager(JobManagerProtocol):
    def __init__(self, jobs: Iterable[JobRecord] = ()) -> None:
        self._lock = RLock()
        self._jobs: "OrderedDict[str, JobRecord]" = OrderedDict(
            (job.job_id, _clone_job_record(job)) for job in jobs
        )

    def upsert(self, job: JobRecord) -> None:
        with self._lock:
            current = self._jobs.get(job.job_id)
            if current is not None and current.state in TERMINAL_STATES and job.state not in TERMINAL_STATES:
                return
            self._jobs[job.job_id] = _clone_job_record(job)

    def create(self, request: JobsCreateRequest) -> JobsCreateResponse:
        state: JobState = request.state or "queued"
        progress = _resolve_progress(None, request.progress, state=state)
        created_at = _utc_now()
        job = JobRecord(
            job_id=f"job-{uuid4().hex[:12]}",
            capability=request.capability,
            target_daw=request.target_daw,
            state=state,
            progress=progress,
            metadata=request.metadata,
            result=request.result,
            error=request.error,
            created_at=created_at,
            started_at=request.started_at,
            finished_at=request.finished_at,
        )
        self.upsert(job)
        return JobsCreateResponse(job=_clone_job_record(job))

    def update(self, request: JobsUpdateRequest) -> JobsUpdateResponse:
        with self._lock:
            current = self._jobs.get(request.job_id)
            if current is None:
                raise JobNotFoundError(request.job_id)
            if current.state in TERMINAL_STATES:
                return JobsUpdateResponse(job=_clone_job_record(current))

            job = _clone_job_record(current)

            if request.state is not None:
                job.state = request.state

            if request.progress is not None:
                job.progress = _resolve_progress(job.progress, request.progress, state=job.state)
            elif request.state is not None:
                job.progress = _resolve_progress(job.progress, None, state=job.state)

            if request.metadata is not None:
                job.metadata = deepcopy(request.metadata)
            if request.result is not None:
                job.result = deepcopy(request.result)
            if request.error is not None:
                job.error = deepcopy(request.error)

            if request.started_at is not None:
                job.started_at = request.started_at
            elif job.state == "running" and job.started_at is None:
                job.started_at = _utc_now()

            if request.finished_at is not None:
                job.finished_at = request.finished_at
            elif job.state in TERMINAL_STATES and job.finished_at is None:
                job.finished_at = _utc_now()

            self._jobs[job.job_id] = _clone_job_record(job)
            return JobsUpdateResponse(job=_clone_job_record(job))

    def get(self, job_id: str) -> JobRecord:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise JobNotFoundError(job_id)
            return _clone_job_record(job)

    def list(self, filter: JobsListRequest | None = None) -> JobsListResponse:
        with self._lock:
            jobs = [_clone_job_record(job) for job in self._jobs.values()]
            if filter is not None:
                if filter.states is not None:
                    allowed_states = set(filter.states)
                    jobs = [job for job in jobs if job.state in allowed_states]
                if filter.capabilities is not None:
                    allowed_capabilities = set(filter.capabilities)
                    jobs = [job for job in jobs if job.capability in allowed_capabilities]
                total_count = len(jobs)
                if filter.limit is not None:
                    jobs = jobs[: max(0, int(filter.limit))]
                    return JobsListResponse(jobs=jobs, total_count=total_count)
            return JobsListResponse(jobs=jobs, total_count=len(jobs))

    def cancel(self, job_id: str) -> JobsCancelResponse:
        with self._lock:
            current = self._jobs.get(job_id)
            if current is None:
                raise JobNotFoundError(job_id)
            if current.state not in {"queued", "running"}:
                raise JobNotRunningError(job_id)
            job = _clone_job_record(current)
            job.state = "cancelled"
            job.progress = _resolve_progress(job.progress, {"phase": "cancelled"}, state="cancelled")
            if job.finished_at is None:
                job.finished_at = _utc_now()
            self._jobs[job_id] = _clone_job_record(job)
            return JobsCancelResponse(cancelled=True, job_id=job_id)

    def delete(self, job_id: str) -> JobsDeleteResponse:
        with self._lock:
            job = self._jobs.get(job_id)
            if job is None:
                raise JobNotFoundError(job_id)
            if job.state == "running":
                raise JobNotRunningError(job_id)
            del self._jobs[job_id]
            return JobsDeleteResponse(deleted=True, job_id=job_id)
