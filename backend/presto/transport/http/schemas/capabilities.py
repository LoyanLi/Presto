from __future__ import annotations

from typing import Any, List, Literal, Optional, Union

from pydantic import BaseModel, Field

from ....domain.capabilities import CapabilityDefinition
from .errors import ErrorResponseSchema


class HealthResponseSchema(BaseModel):
    backend_ready: bool
    daw_connected: bool
    active_daw: str


class CapabilitySchema(BaseModel):
    class CapabilityFieldSupportSchema(BaseModel):
        request_fields: List[str] = Field(default_factory=list)
        response_fields: List[str] = Field(default_factory=list)

    id: str
    version: int
    kind: str
    domain: str
    visibility: str
    description: str
    request_schema: str
    response_schema: str
    depends_on: List[str] = Field(default_factory=list)
    supported_daws: List[str] = Field(default_factory=list)
    canonical_source: str
    field_support: dict[str, CapabilityFieldSupportSchema] = Field(default_factory=dict)
    handler: str
    emits_events: List[str] = Field(default_factory=list)

    @classmethod
    def from_definition(cls, definition: CapabilityDefinition) -> "CapabilitySchema":
        return cls(
            id=definition.id,
            version=definition.version,
            kind=definition.kind,
            domain=definition.domain,
            visibility=definition.visibility,
            description=definition.description,
            request_schema=definition.request_schema.name,
            response_schema=definition.response_schema.name,
            depends_on=list(definition.depends_on),
            supported_daws=list(definition.supported_daws),
            canonical_source=definition.canonical_source,
            field_support={
                daw: cls.CapabilityFieldSupportSchema(
                    request_fields=list(support.request_fields),
                    response_fields=list(support.response_fields),
                )
                for daw, support in definition.field_support.items()
            },
            handler=definition.handler,
            emits_events=list(definition.emits_events),
        )


class CapabilityListResponseSchema(BaseModel):
    capabilities: List[CapabilitySchema]


class CapabilityDetailResponseSchema(BaseModel):
    capability: CapabilitySchema


class CapabilityInvokeMetaSchema(BaseModel):
    clientName: Optional[str] = None
    clientVersion: Optional[str] = None
    locale: Optional[str] = None
    platform: Optional[str] = None
    sdkVersion: Optional[str] = None


class CapabilityInvokeRequestSchema(BaseModel):
    requestId: str
    capability: str
    payload: dict[str, Any] = Field(default_factory=dict)
    meta: Optional[CapabilityInvokeMetaSchema] = None


class CapabilityInvokeSuccessResponseSchema(BaseModel):
    success: Literal[True] = True
    requestId: str
    capability: str
    data: Any


class CapabilityInvokeFailureResponseSchema(BaseModel):
    success: Literal[False] = False
    requestId: str
    capability: str
    error: ErrorResponseSchema


CapabilityInvokeResponseSchema = Union[
    CapabilityInvokeSuccessResponseSchema,
    CapabilityInvokeFailureResponseSchema,
]
