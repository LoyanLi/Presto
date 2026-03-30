from __future__ import annotations

from dataclasses import dataclass
import subprocess
from typing import Any, Protocol

from .protools_ui_profile import ProToolsUiProfile


class MacAutomationEngine(Protocol):
    def preflight_accessibility(self, profile: ProToolsUiProfile) -> None: ...

    def run_script(self, script: str) -> str: ...


class MacAutomationError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        *,
        raw_message: str | None = None,
        retryable: bool = False,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.raw_message = raw_message
        self.retryable = retryable
        self.details = details or {}


@dataclass
class AppleScriptMacAutomationEngine:
    timeout_seconds: int = 10
    osascript_command: str = "osascript"

    def preflight_accessibility(self, profile: ProToolsUiProfile) -> None:
        self.run_script(profile.build_preflight_accessibility_script())

    def run_script(self, script: str) -> str:
        try:
            proc = subprocess.run(
                [self.osascript_command, "-e", script],
                check=True,
                text=True,
                capture_output=True,
                timeout=self.timeout_seconds,
            )
            return proc.stdout.strip()
        except subprocess.TimeoutExpired as exc:
            raise MacAutomationError(
                "UI_TIMEOUT",
                "UI automation command timed out.",
                raw_message=str(exc),
                retryable=True,
                details={"timeout_seconds": self.timeout_seconds},
            ) from exc
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip()
            stdout = (exc.stdout or "").strip()
            message = stderr or stdout or "AppleScript execution failed."
            code = self._classify_error(message)
            raise MacAutomationError(
                code,
                message,
                raw_message=message,
                retryable=code in {"UI_TIMEOUT", "UI_NOT_FRONTMOST", "UI_ELEMENT_NOT_FOUND", "UI_ACTION_FAILED"},
                details={
                    "command": self.osascript_command,
                    "stdout": stdout or None,
                    "stderr": stderr or None,
                },
            ) from exc

    @staticmethod
    def _classify_error(message: str) -> str:
        lowered = message.lower()
        if "frontmost" in lowered:
            return "UI_NOT_FRONTMOST"
        if "not found" in lowered or "can't get" in lowered or "can’t get" in lowered or "invalid index" in lowered:
            return "UI_ELEMENT_NOT_FOUND"
        return "UI_ACTION_FAILED"


def create_default_mac_automation_engine(timeout_seconds: int = 10) -> AppleScriptMacAutomationEngine:
    return AppleScriptMacAutomationEngine(timeout_seconds=timeout_seconds)
