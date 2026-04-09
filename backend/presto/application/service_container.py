from __future__ import annotations

from dataclasses import dataclass
from dataclasses import field
import os

from ..domain.capabilities import SUPPORTED_DAW_TARGETS, DEFAULT_DAW_TARGET, CapabilityRegistryProtocol, DawTarget
from ..domain.ports import (
    ConfigStorePort,
    DawAdapterPort,
    DawUiProfilePort,
    ImportAnalysisStorePort,
    JobHandleRegistryPort,
    KeychainStorePort,
    MacAutomationPort,
)
from ..domain.jobs import JobManagerProtocol
from ..integrations.config_store import create_default_config_store
from ..integrations.keychain_store import create_default_keychain_store
from .capabilities.registry import InMemoryCapabilityRegistry, build_default_capability_registry
from .daw_runtime import resolve_daw_runtime
from .errors.normalizer import ErrorNormalizer
from .jobs.manager import InMemoryJobManager
from .runtime_state import ImportAnalysisStore, InMemoryJobHandleRegistry


@dataclass
class ServiceContainer:
    capability_registry: CapabilityRegistryProtocol
    job_manager: JobManagerProtocol
    error_normalizer: ErrorNormalizer
    daw: DawAdapterPort | None = None
    config_store: ConfigStorePort | None = None
    keychain_store: KeychainStorePort | None = None
    import_analysis_store: ImportAnalysisStorePort = field(default_factory=ImportAnalysisStore)
    job_handle_registry: JobHandleRegistryPort = field(default_factory=InMemoryJobHandleRegistry)
    mac_automation: MacAutomationPort | None = None
    daw_ui_profile: DawUiProfilePort | None = None
    target_daw: DawTarget = DEFAULT_DAW_TARGET
    backend_ready: bool = True


def build_service_container(
    *,
    capability_registry: CapabilityRegistryProtocol | None = None,
    job_manager: JobManagerProtocol | None = None,
    error_normalizer: ErrorNormalizer | None = None,
    daw: DawAdapterPort | None = None,
    config_store: ConfigStorePort | None = None,
    keychain_store: KeychainStorePort | None = None,
    import_analysis_store: ImportAnalysisStorePort | None = None,
    job_handle_registry: JobHandleRegistryPort | None = None,
    mac_automation: MacAutomationPort | None = None,
    daw_ui_profile: DawUiProfilePort | None = None,
) -> ServiceContainer:
    env_target_daw = os.environ.get("PRESTO_TARGET_DAW", DEFAULT_DAW_TARGET)
    resolved_target_daw = env_target_daw if env_target_daw in SUPPORTED_DAW_TARGETS else DEFAULT_DAW_TARGET
    resolved_config_store = config_store or create_default_config_store()
    resolved_keychain_store = keychain_store or create_default_keychain_store()
    resolved_daw_runtime = resolve_daw_runtime(
        resolved_target_daw,
        daw=daw,
        mac_automation=mac_automation,
        daw_ui_profile=daw_ui_profile,
    )

    return ServiceContainer(
        capability_registry=capability_registry or build_default_capability_registry(),
        job_manager=job_manager or InMemoryJobManager(),
        error_normalizer=error_normalizer or ErrorNormalizer(),
        daw=resolved_daw_runtime.daw,
        config_store=resolved_config_store,
        keychain_store=resolved_keychain_store,
        import_analysis_store=import_analysis_store or ImportAnalysisStore(),
        job_handle_registry=job_handle_registry or InMemoryJobHandleRegistry(),
        mac_automation=resolved_daw_runtime.mac_automation,
        daw_ui_profile=resolved_daw_runtime.daw_ui_profile,
        target_daw=resolved_target_daw,
    )
