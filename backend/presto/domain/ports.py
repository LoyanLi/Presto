from __future__ import annotations

from typing import Any, Callable, Protocol

from .capabilities import CapabilityRegistryProtocol, DawTarget
from .jobs import JobManagerProtocol


class ImportAnalysisStorePort(Protocol):
    hits: int
    misses: int

    def get_or_set(self, key: str, builder: Callable[[], dict[str, Any]]) -> dict[str, Any]:
        ...


class JobExecutionHandlePort(Protocol):
    def cancel(self) -> None:
        ...


class JobHandleRegistryPort(Protocol):
    def register(self, job_id: str, handle: JobExecutionHandlePort) -> None:
        ...

    def get(self, job_id: str) -> JobExecutionHandlePort | None:
        ...

    def pop(self, job_id: str) -> JobExecutionHandlePort | None:
        ...

    def cancel(self, job_id: str) -> bool:
        ...


class ConfigStorePort(Protocol):
    def load(self) -> Any:
        ...

    def save(self, config: Any) -> None:
        ...


class KeychainStorePort(Protocol):
    def get_api_key(self, service: str, account: str) -> str | None:
        ...

    def set_api_key(self, service: str, account: str, api_key: str) -> None:
        ...

    def delete_api_key(self, service: str, account: str) -> None:
        ...


class AiServicePort(Protocol):
    def is_available(self) -> bool:
        ...


class DawAdapterPort(Protocol):
    def connect(self, host: str | None = None, port: int | None = None, timeout_seconds: int | None = None) -> bool:
        ...

    def disconnect(self) -> None:
        ...

    def is_connected(self) -> bool:
        ...

    def save_session(self) -> None:
        ...


class MacAutomationPort(Protocol):
    def preflight_accessibility(self) -> None:
        ...


class DawUiProfilePort(Protocol):
    def open_strip_silence_window(self) -> None:
        ...

    def execute_strip_silence(self, track_name: str, profile: Any) -> None:
        ...


class LoggerPort(Protocol):
    def debug(self, message: str, meta: dict[str, Any] | None = None) -> None:
        ...

    def info(self, message: str, meta: dict[str, Any] | None = None) -> None:
        ...

    def warn(self, message: str, meta: dict[str, Any] | None = None) -> None:
        ...

    def error(self, message: str, meta: dict[str, Any] | None = None) -> None:
        ...


class ErrorNormalizerPort(Protocol):
    def normalize(
        self,
        error: Exception,
        *,
        capability: str | None = None,
        adapter: str | None = None,
    ) -> Any:
        ...


class CapabilityExecutionContext(Protocol):
    request_id: str
    backend_ready: bool
    target_daw: DawTarget
    registry: CapabilityRegistryProtocol
    jobs: JobManagerProtocol
    config_store: ConfigStorePort | None
    keychain_store: KeychainStorePort | None
    import_analysis_store: ImportAnalysisStorePort
    job_handle_registry: JobHandleRegistryPort
    ai_service: AiServicePort | None
    daw: DawAdapterPort | None
    mac_automation: MacAutomationPort | None
    daw_ui_profile: DawUiProfilePort | None
    logger: LoggerPort | None
    error_normalizer: ErrorNormalizerPort

    def now(self) -> str:
        ...
