from __future__ import annotations

from ...domain.capabilities import (
    CapabilityDependency,
    CapabilityImplementation,
    CapabilityFieldSupport,
    CapabilityDefinition,
    CapabilityDomain,
    CapabilityKind,
    CapabilityPortability,
    CapabilitySchemaRef,
    CapabilityVisibility,
    CapabilityWorkflowScope,
    DEFAULT_DAW_TARGET,
    DawTarget,
)


def _schema(name: str) -> CapabilitySchemaRef:
    return CapabilitySchemaRef(name=name)


def definition(
    capability_id: str,
    *,
    kind: CapabilityKind,
    domain: CapabilityDomain,
    visibility: CapabilityVisibility,
    description: str,
    request_schema: str,
    response_schema: str,
    depends_on: tuple[CapabilityDependency, ...] = (),
    workflow_scope: CapabilityWorkflowScope = "shared",
    portability: CapabilityPortability = "canonical",
    supported_daws: tuple[DawTarget, ...] = (DEFAULT_DAW_TARGET,),
    canonical_source: DawTarget | None = None,
    field_support: dict[DawTarget, CapabilityFieldSupport] | None = None,
    implementations: dict[DawTarget, CapabilityImplementation] | None = None,
    handler: str,
    emits_events: tuple[str, ...] = (),
) -> CapabilityDefinition:
    resolved_canonical_source = canonical_source or supported_daws[0]
    return CapabilityDefinition(
        id=capability_id,
        version=1,
        kind=kind,
        domain=domain,
        visibility=visibility,
        description=description,
        request_schema=_schema(request_schema),
        response_schema=_schema(response_schema),
        depends_on=depends_on,
        workflow_scope=workflow_scope,
        portability=portability,
        supported_daws=supported_daws,
        canonical_source=resolved_canonical_source,
        field_support=field_support or {},
        implementations=implementations or {},
        handler=handler,
        emits_events=emits_events,
    )
