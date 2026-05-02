from __future__ import annotations

from typing import Any

from ...domain.jobs import JobManagerProtocol, JobsCancelResponse
from ...domain.ports import JobHandleRegistryPort


EXPORT_CAPABILITIES = frozenset({"daw.export.start", "daw.export.direct.start", "daw.export.run.start"})


def cancel_managed_job(
    *,
    job_manager: JobManagerProtocol,
    job_handle_registry: JobHandleRegistryPort,
    daw: Any,
    job_id: str,
) -> JobsCancelResponse:
    result = job_manager.cancel(job_id)
    job_handle_registry.cancel(job_id)

    job = job_manager.get(job_id)
    if job.capability in EXPORT_CAPABILITIES:
        cancel_export = getattr(daw, "cancel_export", None) if daw is not None else None
        if callable(cancel_export):
            cancel_export()

    return result
