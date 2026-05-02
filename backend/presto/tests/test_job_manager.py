from __future__ import annotations

from presto.application.jobs.manager import InMemoryJobManager
from presto.domain.errors import PrestoErrorPayload
from presto.domain.jobs import JobProgress, JobRecord, JobsListRequest, JobsUpdateRequest


def _running_job() -> JobRecord:
    return JobRecord(
        job_id="job-1",
        capability="workflow.run.start",
        target_daw="pro_tools",
        state="running",
        progress=JobProgress(phase="running", current=1, total=4, percent=25.0, message="running"),
        metadata={"nested": {"count": 1}},
        result={"steps": {"rename": "Lead Vox"}},
        error=PrestoErrorPayload(code="INITIAL", message="initial"),
        created_at="2026-04-19T00:00:00+00:00",
        started_at="2026-04-19T00:00:01+00:00",
    )


def test_job_manager_returns_detached_snapshots() -> None:
    manager = InMemoryJobManager([_running_job()])

    fetched = manager.get("job-1")
    fetched.metadata["nested"]["count"] = 99
    fetched.result["steps"]["rename"] = "Mutated"
    fetched.error = PrestoErrorPayload(code="MUTATED", message="mutated")

    listed = manager.list().jobs[0]
    listed.metadata["nested"]["count"] = 77

    stored = manager.get("job-1")
    assert stored.metadata == {"nested": {"count": 1}}
    assert stored.result == {"steps": {"rename": "Lead Vox"}}
    assert stored.error == PrestoErrorPayload(code="INITIAL", message="initial")


def test_job_manager_ignores_stale_updates_after_terminal_transition() -> None:
    manager = InMemoryJobManager([_running_job()])

    stale_snapshot = manager.get("job-1")
    manager.cancel("job-1")

    stale_snapshot.state = "running"
    stale_snapshot.progress = JobProgress(phase="running", current=4, total=4, percent=100.0, message="stale")
    stale_snapshot.result = {"steps": {"rename": "Reopened"}}
    stale_snapshot.error = PrestoErrorPayload(code="STALE", message="stale")
    manager.upsert(stale_snapshot)

    manager.update(
        JobsUpdateRequest(
            job_id="job-1",
            state="failed",
            progress={"phase": "failed", "current": 4, "total": 4, "percent": 100.0, "message": "failed"},
            error=PrestoErrorPayload(code="FAILED", message="failed"),
        )
    )

    stored = manager.get("job-1")
    assert stored.state == "cancelled"
    assert stored.progress.phase == "cancelled"
    assert stored.result == {"steps": {"rename": "Lead Vox"}}
    assert stored.error == PrestoErrorPayload(code="INITIAL", message="initial")
    assert stored.finished_at is not None


def test_job_manager_list_total_count_ignores_limit() -> None:
    second_job = _running_job()
    second_job.job_id = "job-2"
    second_job.capability = "daw.export.start"
    third_job = _running_job()
    third_job.job_id = "job-3"
    manager = InMemoryJobManager([_running_job(), second_job, third_job])

    result = manager.list(filter=JobsListRequest(capabilities=("workflow.run.start",), limit=1))

    assert [job.job_id for job in result.jobs] == ["job-1"]
    assert result.total_count == 2
