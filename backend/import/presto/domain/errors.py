"""Application exceptions."""

from __future__ import annotations


class PrestoError(Exception):
    """Base error with structured error code."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class ValidationError(PrestoError):
    """Input validation error."""


class GatewayError(PrestoError):
    """PTSL gateway failure."""


class UiAutomationError(PrestoError):
    """AppleScript UI automation failure."""


class AiNamingError(PrestoError):
    """AI naming workflow failure."""
