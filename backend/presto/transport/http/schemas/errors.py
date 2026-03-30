from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel

from ....domain.errors import PrestoErrorPayload


class ErrorResponseSchema(BaseModel):
    code: str
    message: str
    details: Optional[Dict[str, Any]] = None
    source: str
    retryable: bool
    capability: Optional[str] = None
    adapter: Optional[str] = None

    @classmethod
    def from_payload(cls, payload: PrestoErrorPayload) -> "ErrorResponseSchema":
        return cls(
            code=payload.code,
            message=payload.message,
            details=payload.details,
            source=payload.source,
            retryable=payload.retryable,
            capability=payload.capability,
            adapter=payload.adapter,
        )
