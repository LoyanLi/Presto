from __future__ import annotations

from presto.domain.jobs import JobProgress, JobRecord
from presto.transport.http.schemas.jobs import JobSchema


def test_job_schema_from_record_preserves_metadata() -> None:
    record = JobRecord(
        job_id="job-123",
        capability="jobs.get",
        target_daw="pro_tools",
        state="running",
        progress=JobProgress(
            phase="running",
            current=2,
            total=5,
            percent=29.0,
            message="Exporting current file.",
        ),
        metadata={
            "currentSnapshot": 2,
            "currentSnapshotName": "Verse A",
            "totalSnapshots": 5,
            "currentFileProgressPercent": 29.0,
            "overallProgressPercent": 25.8,
            "exportedCount": 1,
        },
        created_at="2026-03-28T00:00:00+00:00",
        started_at="2026-03-28T00:00:01+00:00",
    )

    schema = JobSchema.from_record(record)

    assert schema.metadata == {
        "currentSnapshot": 2,
        "currentSnapshotName": "Verse A",
        "totalSnapshots": 5,
        "currentFileProgressPercent": 29.0,
        "overallProgressPercent": 25.8,
        "exportedCount": 1,
    }
