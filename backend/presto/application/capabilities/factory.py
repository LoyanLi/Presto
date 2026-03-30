from __future__ import annotations

from ...domain.capabilities import (
    CapabilityDependency,
    CapabilityDefinition,
    CapabilityDomain,
    CapabilityKind,
    CapabilitySchemaRef,
    CapabilityVisibility,
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
    supported_daws: tuple[DawTarget, ...] = (DEFAULT_DAW_TARGET,),
    handler: str,
    emits_events: tuple[str, ...] = (),
) -> CapabilityDefinition:
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
        supported_daws=supported_daws,
        handler=handler,
        emits_events=emits_events,
    )
