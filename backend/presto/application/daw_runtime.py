from __future__ import annotations

from dataclasses import dataclass

from ..domain.capabilities import DawTarget
from ..domain.ports import DawAdapterPort, DawUiProfilePort, MacAutomationPort
from ..integrations.daw import ProToolsDawAdapter
from ..integrations.mac import ProToolsUiProfile, create_default_mac_automation_engine


@dataclass(frozen=True)
class DawRuntimeDependencies:
    daw: DawAdapterPort | None
    mac_automation: MacAutomationPort | None
    daw_ui_profile: DawUiProfilePort | None


def _resolve_pro_tools_runtime(
    *,
    daw: DawAdapterPort | None,
    mac_automation: MacAutomationPort | None,
    daw_ui_profile: DawUiProfilePort | None,
) -> DawRuntimeDependencies:
    return DawRuntimeDependencies(
        daw=daw or ProToolsDawAdapter(address="127.0.0.1:31416"),
        mac_automation=mac_automation or create_default_mac_automation_engine(),
        daw_ui_profile=daw_ui_profile or ProToolsUiProfile(),
    )


DAW_RUNTIME_FACTORIES = {
    "pro_tools": _resolve_pro_tools_runtime,
}


def resolve_daw_runtime(
    target_daw: DawTarget,
    *,
    daw: DawAdapterPort | None = None,
    mac_automation: MacAutomationPort | None = None,
    daw_ui_profile: DawUiProfilePort | None = None,
) -> DawRuntimeDependencies:
    factory = DAW_RUNTIME_FACTORIES.get(target_daw)
    if factory is None:
        raise ValueError(f"unsupported_daw_runtime:{target_daw}")
    return factory(
        daw=daw,
        mac_automation=mac_automation,
        daw_ui_profile=daw_ui_profile,
    )
