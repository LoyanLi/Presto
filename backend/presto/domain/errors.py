from __future__ import annotations

from dataclasses import dataclass
from typing import Any


ErrorSource = str


@dataclass(frozen=True)
class PrestoErrorPayload:
    code: str
    message: str
    details: dict[str, Any] | None = None
    source: ErrorSource = "runtime"
    retryable: bool = False
    capability: str | None = None
    adapter: str | None = None


class PrestoError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        source: ErrorSource = "runtime",
        retryable: bool = False,
        details: dict[str, Any] | None = None,
        capability: str | None = None,
        adapter: str | None = None,
        status_code: int = 500,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.source = source
        self.retryable = retryable
        self.details = details
        self.capability = capability
        self.adapter = adapter
        self.status_code = status_code

    def to_payload(self) -> PrestoErrorPayload:
        return PrestoErrorPayload(
            code=self.code,
            message=self.message,
            details=self.details,
            source=self.source,
            retryable=self.retryable,
            capability=self.capability,
            adapter=self.adapter,
        )


class PrestoValidationError(PrestoError):
    def __init__(self, message: str, *, details: dict[str, Any] | None = None, capability: str | None = None) -> None:
        super().__init__(
            "VALIDATION_ERROR",
            message,
            source="capability",
            retryable=False,
            details=details,
            capability=capability,
            status_code=400,
        )


class CapabilityNotFoundError(PrestoError):
    def __init__(self, capability_id: str) -> None:
        super().__init__(
            "VALIDATION_ERROR",
            f"Capability not found: {capability_id}",
            source="runtime",
            retryable=False,
            details={"capability_id": capability_id},
            capability=capability_id,
            status_code=404,
        )


class CapabilityRegistryConflictError(PrestoError):
    def __init__(self, capability_id: str) -> None:
        super().__init__(
            "VALIDATION_ERROR",
            f"Capability already registered: {capability_id}",
            source="runtime",
            retryable=False,
            details={"capability_id": capability_id},
            capability=capability_id,
            status_code=409,
        )


class JobNotFoundError(PrestoError):
    def __init__(self, job_id: str) -> None:
        super().__init__(
            "JOB_NOT_FOUND",
            f"Job not found: {job_id}",
            source="runtime",
            retryable=False,
            details={"job_id": job_id},
            status_code=404,
        )


class JobNotRunningError(PrestoError):
    def __init__(self, job_id: str) -> None:
        super().__init__(
            "JOB_NOT_RUNNING",
            f"Job is not running: {job_id}",
            source="runtime",
            retryable=False,
            details={"job_id": job_id},
            status_code=409,
        )
