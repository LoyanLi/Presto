from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, Literal


CapabilityKind = Literal["query", "command", "job"]
CapabilityVisibility = Literal["public", "internal"]
CapabilityDomain = Literal[
    "system",
    "config",
    "ai",
    "daw",
    "automation",
    "session",
    "track",
    "clip",
    "transport",
    "import",
    "stripSilence",
    "export",
    "jobs",
]
CapabilityDependency = Literal[
    "config_store",
    "keychain_store",
    "ai_service",
    "jobs",
    "daw",
    "mac_automation",
    "daw_ui_profile",
]
DawTarget = Literal["pro_tools", "logic", "cubase", "nuendo"]

CAPABILITY_PACKAGE = "@presto/contracts"
DEFAULT_DAW_TARGET: DawTarget = "pro_tools"


@dataclass(frozen=True)
class CapabilitySchemaRef:
    name: str
    package: str = CAPABILITY_PACKAGE
    version: int = 1
    example: Any | None = None


@dataclass(frozen=True)
class CapabilityDefinition:
    id: str
    version: int
    kind: CapabilityKind
    domain: CapabilityDomain
    visibility: CapabilityVisibility
    description: str
    request_schema: CapabilitySchemaRef
    response_schema: CapabilitySchemaRef
    depends_on: tuple[CapabilityDependency, ...] = field(default_factory=tuple)
    supported_daws: tuple[DawTarget, ...] = field(default_factory=tuple)
    handler: str = ""
    emits_events: tuple[str, ...] = field(default_factory=tuple)


class CapabilityRegistryProtocol(Protocol):
    def list_public(self) -> list[CapabilityDefinition]:
        ...

    def list_all(self) -> list[CapabilityDefinition]:
        ...

    def get(self, capability_id: str) -> CapabilityDefinition | None:
        ...

    def require(self, capability_id: str) -> CapabilityDefinition:
        ...

    def has(self, capability_id: str) -> bool:
        ...
