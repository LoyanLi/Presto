from __future__ import annotations

from dataclasses import asdict
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from ....domain.jobs import JobRecord


class JobProgressSchema(BaseModel):
    phase: str
    current: int
    total: int
    percent: float
    message: Optional[str] = None


class JobSchema(BaseModel):
    job_id: str
    capability: str
    target_daw: str
    state: str
    progress: JobProgressSchema
    metadata: Optional[Dict[str, Any]] = None
    result: Optional[Any] = None
    error: Optional[Dict[str, Any]] = None
    created_at: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None

    @classmethod
    def from_record(cls, record: JobRecord) -> "JobSchema":
        return cls(
            job_id=record.job_id,
            capability=record.capability,
            target_daw=record.target_daw,
            state=record.state,
            progress=JobProgressSchema(
                phase=record.progress.phase,
                current=record.progress.current,
                total=record.progress.total,
                percent=record.progress.percent,
                message=record.progress.message,
            ),
            metadata=record.metadata,
            result=record.result,
            error=asdict(record.error) if record.error is not None else None,
            created_at=record.created_at,
            started_at=record.started_at,
            finished_at=record.finished_at,
        )


class JobListResponseSchema(BaseModel):
    jobs: List[JobSchema]
    total_count: int


class JobDetailResponseSchema(BaseModel):
    job: JobSchema


class JobActionResponseSchema(BaseModel):
    job_id: str
    action: str
    success: bool
