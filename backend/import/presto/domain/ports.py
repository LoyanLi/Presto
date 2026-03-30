from __future__ import annotations

from typing import Any, Protocol

from .capabilities import CapabilityRegistryProtocol, DawTarget
from .jobs import JobManagerProtocol


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


class CapabilityExecutionContext(Protocol):
    request_id: str
    target_daw: DawTarget
    registry: CapabilityRegistryProtocol
    jobs: JobManagerProtocol
    config_store: ConfigStorePort
    keychain_store: KeychainStorePort
    ai_service: AiServicePort | None
    daw: DawAdapterPort | None
    mac_automation: MacAutomationPort | None
    daw_ui_profile: DawUiProfilePort | None
    logger: LoggerPort

    def now(self) -> str:
        ...

