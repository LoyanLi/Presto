from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field
from copy import deepcopy
import json
import os
from pathlib import Path
import subprocess
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


def create_default_app_config() -> dict[str, Any]:
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
        "hostPreferences": {
            "language": "system",
            "dawTarget": DEFAULT_DAW_TARGET,
            "includePrereleaseUpdates": False,
        },
    }


@dataclass
class InMemoryConfigStore:
    config: dict[str, Any] = field(default_factory=create_default_app_config)

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


@dataclass
class FileConfigStore:
    file_path: Path

    def load(self) -> dict[str, Any]:
        if not self.file_path.exists():
            config = create_default_app_config()
            self.save(config)
            return deepcopy(config)

        raw = self.file_path.read_text(encoding="utf8")
        loaded = json.loads(raw)
        if not isinstance(loaded, dict):
            raise ValueError("config_file_must_contain_json_object")
        return deepcopy(loaded)

    def save(self, config: Any) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        self.file_path.write_text(f"{json.dumps(config, indent=2, ensure_ascii=True)}\n", encoding="utf8")


class MacOsKeychainStore:
    def __init__(self, *, run_security=None) -> None:
        self._run_security = run_security or self._default_run_security

    @staticmethod
    def _default_run_security(args: list[str], input_text: str | None = None) -> str:
        result = subprocess.run(
            ["security", *args],
            input=input_text,
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "security_command_failed")
        return result.stdout.strip()

    def get_api_key(self, service: str, account: str) -> str | None:
        try:
            return self._run_security(["find-generic-password", "-w", "-s", service, "-a", account])
        except RuntimeError:
            return None

    def set_api_key(self, service: str, account: str, api_key: str) -> None:
        self._run_security(
            ["add-generic-password", "-U", "-s", service, "-a", account, "-w"],
            input_text=api_key,
        )

    def delete_api_key(self, service: str, account: str) -> None:
        try:
            self._run_security(["delete-generic-password", "-s", service, "-a", account])
        except RuntimeError:
            return


def create_default_config_store() -> ConfigStorePort:
    app_data_dir = os.environ.get("PRESTO_APP_DATA_DIR", "").strip()
    if not app_data_dir:
        return InMemoryConfigStore()
    return FileConfigStore(Path(app_data_dir).expanduser().resolve() / "config.json")


def create_default_keychain_store() -> KeychainStorePort:
    return MacOsKeychainStore()


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
    resolved_config_store = config_store or create_default_config_store()
    resolved_keychain_store = keychain_store or create_default_keychain_store()

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
