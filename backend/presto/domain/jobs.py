from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, Literal

from .capabilities import DawTarget
from .errors import PrestoErrorPayload


JobState = Literal["queued", "running", "succeeded", "failed", "cancelled"]


@dataclass(frozen=True)
class JobProgress:
    phase: str
    current: int
    total: int
    percent: float
    message: str | None = None


@dataclass
class JobRecord:
    job_id: str
    capability: str
    target_daw: DawTarget
    state: JobState
    progress: JobProgress = field(default_factory=lambda: JobProgress(phase="", current=0, total=0, percent=0.0))
    metadata: dict[str, Any] | None = None
    result: object | None = None
    error: PrestoErrorPayload | None = None
    created_at: str = ""
    started_at: str | None = None
    finished_at: str | None = None


@dataclass(frozen=True)
class JobAcceptedResponse:
    job_id: str
    capability: str
    state: Literal["queued", "running"]


@dataclass(frozen=True)
class JobsGetResponse:
    job: JobRecord


@dataclass(frozen=True)
class JobsCreateRequest:
    capability: str
    target_daw: DawTarget
    state: JobState | None = None
    progress: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None
    result: object | None = None
    error: PrestoErrorPayload | None = None
    started_at: str | None = None
    finished_at: str | None = None


@dataclass(frozen=True)
class JobsCreateResponse:
    job: JobRecord


@dataclass(frozen=True)
class JobsListRequest:
    states: tuple[JobState, ...] | None = None
    capabilities: tuple[str, ...] | None = None
    limit: int | None = None


@dataclass(frozen=True)
class JobsListResponse:
    jobs: list[JobRecord]
    total_count: int


@dataclass(frozen=True)
class JobsCancelResponse:
    cancelled: bool
    job_id: str


@dataclass(frozen=True)
class JobsDeleteResponse:
    deleted: bool
    job_id: str


@dataclass(frozen=True)
class JobsUpdateRequest:
    job_id: str
    state: JobState | None = None
    progress: dict[str, Any] | None = None
    metadata: dict[str, Any] | None = None
    result: object | None = None
    error: PrestoErrorPayload | None = None
    started_at: str | None = None
    finished_at: str | None = None


@dataclass(frozen=True)
class JobsUpdateResponse:
    job: JobRecord


class JobManagerProtocol(Protocol):
    def upsert(self, job: JobRecord) -> None:
        ...

    def create(self, request: JobsCreateRequest) -> JobsCreateResponse:
        ...

    def update(self, request: JobsUpdateRequest) -> JobsUpdateResponse:
        ...

    def get(self, job_id: str) -> JobRecord:
        ...

    def list(self, filter: JobsListRequest | None = None) -> JobsListResponse:
        ...

    def cancel(self, job_id: str) -> JobsCancelResponse:
        ...

    def delete(self, job_id: str) -> JobsDeleteResponse:
        ...
