from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol, Literal

from .daw_targets_generated import DawTarget, DEFAULT_DAW_TARGET, RESERVED_DAW_TARGETS, SUPPORTED_DAW_TARGETS


CapabilityKind = Literal["query", "command", "job"]
CapabilityVisibility = Literal["public", "internal"]
CapabilityWorkflowScope = Literal["shared", "daw_specific", "internal"]
CapabilityPortability = Literal["canonical", "daw_specific"]
CapabilityImplementationKind = Literal["handler", "ptsl_command", "ptsl_composed", "ui_automation"]
CapabilityDomain = Literal[
    "system",
    "config",
    "ai",
    "daw",
    "automation",
    "workflow",
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

CAPABILITY_PACKAGE = "@presto/contracts"


@dataclass(frozen=True)
class CapabilitySchemaRef:
    name: str
    package: str = CAPABILITY_PACKAGE
    version: int = 1
    example: Any | None = None


@dataclass(frozen=True)
class CapabilityFieldSupport:
    request_fields: tuple[str, ...] = field(default_factory=tuple)
    response_fields: tuple[str, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class CapabilityImplementation:
    kind: CapabilityImplementationKind
    handler: str | None = None
    command: str | None = None
    commands: tuple[str, ...] = field(default_factory=tuple)


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
    workflow_scope: CapabilityWorkflowScope = "shared"
    portability: CapabilityPortability = "canonical"
    supported_daws: tuple[DawTarget, ...] = field(default_factory=tuple)
    canonical_source: DawTarget = DEFAULT_DAW_TARGET
    field_support: dict[DawTarget, CapabilityFieldSupport] = field(default_factory=dict)
    implementations: dict[DawTarget, CapabilityImplementation] = field(default_factory=dict)
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
