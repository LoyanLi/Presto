from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from uuid import uuid4

from ..service_container import ServiceContainer
from ...domain.capabilities import CapabilityRegistryProtocol, DawTarget
from ...domain.jobs import JobManagerProtocol
from ...domain.ports import (
    AiServicePort,
    CapabilityExecutionContext,
    ConfigStorePort,
    DawAdapterPort,
    DawUiProfilePort,
    ErrorNormalizerPort,
    ImportAnalysisStorePort,
    JobHandleRegistryPort,
    KeychainStorePort,
    LoggerPort,
    MacAutomationPort,
)


@dataclass(frozen=True)
class DefaultCapabilityExecutionContext(CapabilityExecutionContext):
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
        return datetime.now(timezone.utc).isoformat()


def build_execution_context(services: ServiceContainer, *, request_id: str | None) -> CapabilityExecutionContext:
    resolved_request_id = request_id or f"req-{uuid4().hex}"
    return DefaultCapabilityExecutionContext(
        request_id=resolved_request_id,
        backend_ready=services.backend_ready,
        target_daw=services.target_daw,
        registry=services.capability_registry,
        jobs=services.job_manager,
        config_store=services.config_store,
        keychain_store=services.keychain_store,
        import_analysis_store=services.import_analysis_store,
        job_handle_registry=services.job_handle_registry,
        ai_service=getattr(services, "ai_service", None),
        daw=services.daw,
        mac_automation=services.mac_automation,
        daw_ui_profile=services.daw_ui_profile,
        logger=getattr(services, "logger", None),
        error_normalizer=services.error_normalizer,
    )
