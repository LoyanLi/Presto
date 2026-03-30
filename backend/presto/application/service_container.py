from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field
from copy import deepcopy
import os
from typing import Any

from ..domain.capabilities import DEFAULT_DAW_TARGET, CapabilityRegistryProtocol, DawTarget
from ..domain.ports import ConfigStorePort, KeychainStorePort
from ..domain.jobs import JobManagerProtocol
from ..integrations.daw import ProToolsDawAdapter
from ..integrations.mac import ProToolsUiProfile, create_default_mac_automation_engine
from .capabilities.registry import InMemoryCapabilityRegistry, build_default_capability_registry
from .errors.normalizer import ErrorNormalizer
from .jobs.manager import InMemoryJobManager
from .handlers.import_workflow import ImportAnalysisCache


@dataclass
class ServiceContainer:
    capability_registry: CapabilityRegistryProtocol
    job_manager: JobManagerProtocol
    error_normalizer: ErrorNormalizer
    daw: object | None = None
    config_store: ConfigStorePort | None = None
    keychain_store: KeychainStorePort | None = None
    mac_automation: object | None = None
    daw_ui_profile: object | None = None
    import_analysis_cache: ImportAnalysisCache | None = None
    target_daw: DawTarget = DEFAULT_DAW_TARGET
    backend_ready: bool = True


def _default_app_config() -> dict[str, Any]:
    return {
        "categories": [],
        "silenceProfile": {
            "thresholdDb": -40,
            "minStripMs": 50,
            "minSilenceMs": 250,
            "startPadMs": 0,
            "endPadMs": 0,
        },
        "aiNaming": {
            "enabled": False,
            "baseUrl": "",
            "model": "",
            "timeoutSeconds": 30,
            "keychainService": "openai",
            "keychainAccount": "api_key",
        },
        "uiPreferences": {
            "logsCollapsedByDefault": True,
            "followSystemTheme": True,
            "developerModeEnabled": True,
        },
    }


@dataclass
class InMemoryConfigStore:
    config: dict[str, Any] = field(default_factory=_default_app_config)

    def load(self) -> dict[str, Any]:
        return deepcopy(self.config)

    def save(self, config: Any) -> None:
        self.config = deepcopy(config)


@dataclass
class InMemoryKeychainStore:
    values: dict[tuple[str, str], str] = field(default_factory=dict)

    def get_api_key(self, service: str, account: str) -> str | None:
        return self.values.get((service, account))

    def set_api_key(self, service: str, account: str, api_key: str) -> None:
        self.values[(service, account)] = api_key

    def delete_api_key(self, service: str, account: str) -> None:
        self.values.pop((service, account), None)


def build_service_container(
    *,
    capability_registry: CapabilityRegistryProtocol | None = None,
    job_manager: JobManagerProtocol | None = None,
    error_normalizer: ErrorNormalizer | None = None,
    daw: object | None = None,
    config_store: ConfigStorePort | None = None,
    keychain_store: KeychainStorePort | None = None,
    mac_automation: object | None = None,
    daw_ui_profile: object | None = None,
) -> ServiceContainer:
    env_target_daw = os.environ.get("PRESTO_TARGET_DAW", DEFAULT_DAW_TARGET)
    resolved_target_daw = env_target_daw if env_target_daw == DEFAULT_DAW_TARGET else DEFAULT_DAW_TARGET
    resolved_ui_profile = daw_ui_profile or ProToolsUiProfile()
    resolved_mac_automation = mac_automation or create_default_mac_automation_engine()
    resolved_daw = daw or ProToolsDawAdapter(address="127.0.0.1:31416")
    resolved_config_store = config_store or InMemoryConfigStore()
    resolved_keychain_store = keychain_store or InMemoryKeychainStore()

    return ServiceContainer(
        capability_registry=capability_registry or build_default_capability_registry(),
        job_manager=job_manager or InMemoryJobManager(),
        error_normalizer=error_normalizer or ErrorNormalizer(),
        daw=resolved_daw,
        config_store=resolved_config_store,
        keychain_store=resolved_keychain_store,
        mac_automation=resolved_mac_automation,
        daw_ui_profile=resolved_ui_profile,
        import_analysis_cache=ImportAnalysisCache(),
        target_daw=resolved_target_daw,
    )
