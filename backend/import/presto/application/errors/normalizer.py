from __future__ import annotations

from ...domain.errors import PrestoError, PrestoErrorPayload


class ErrorNormalizer:
    def normalize(self, error: Exception, *, capability: str | None = None, adapter: str | None = None) -> PrestoErrorPayload:
        if isinstance(error, PrestoError):
            payload = error.to_payload()
            if capability is not None and payload.capability is None:
                payload = PrestoErrorPayload(
                    code=payload.code,
                    message=payload.message,
                    details=payload.details,
                    source=payload.source,
                    retryable=payload.retryable,
                    capability=capability,
                    adapter=payload.adapter or adapter,
                )
            return payload

        if isinstance(error, (KeyError, ValueError)):
            return PrestoErrorPayload(
                code="VALIDATION_ERROR",
                message=str(error),
                source="capability",
                retryable=False,
                capability=capability,
                adapter=adapter,
            )

        if isinstance(error, NotImplementedError):
            return PrestoErrorPayload(
                code="UNEXPECTED_ERROR",
                message=str(error) or "Operation not implemented",
                source="runtime",
                retryable=False,
                capability=capability,
                adapter=adapter,
            )

        return PrestoErrorPayload(
            code="UNEXPECTED_ERROR",
            message=str(error) or "Unexpected error",
            source="runtime",
            retryable=False,
            capability=capability,
            adapter=adapter,
        )

