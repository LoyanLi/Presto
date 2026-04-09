from __future__ import annotations

from presto.application.service_container import build_service_container
from presto.domain.capabilities import RESERVED_DAW_TARGETS, SUPPORTED_DAW_TARGETS
from presto.integrations.daw import ProToolsDawAdapter
from presto.integrations.mac import ProToolsUiProfile


def test_domain_distinguishes_supported_daw_targets_from_reserved_targets(monkeypatch) -> None:
    monkeypatch.setenv("PRESTO_TARGET_DAW", "logic")

    services = build_service_container()

    assert SUPPORTED_DAW_TARGETS == ("pro_tools",)
    assert RESERVED_DAW_TARGETS == ("pro_tools", "logic", "cubase", "nuendo")
    assert services.target_daw == "pro_tools"


def test_service_container_resolves_current_supported_daw_runtime_dependencies() -> None:
    services = build_service_container()

    assert services.target_daw == "pro_tools"
    assert isinstance(services.daw, ProToolsDawAdapter)
    assert isinstance(services.daw_ui_profile, ProToolsUiProfile)
    assert services.mac_automation is not None
