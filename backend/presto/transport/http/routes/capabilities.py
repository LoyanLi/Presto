from __future__ import annotations

from fastapi import APIRouter, Request

from ....application.service_container import ServiceContainer
from ..schemas.capabilities import CapabilityDetailResponseSchema, CapabilityListResponseSchema, CapabilitySchema


router = APIRouter(tags=["capabilities"])


def _services(request: Request) -> ServiceContainer:
    return request.app.state.services


@router.get("/capabilities", response_model=CapabilityListResponseSchema)
def list_capabilities(request: Request) -> CapabilityListResponseSchema:
    services = _services(request)
    return CapabilityListResponseSchema(
        capabilities=[CapabilitySchema.from_definition(definition) for definition in services.capability_registry.list_public()]
    )


@router.get("/capabilities/{capability_id}", response_model=CapabilityDetailResponseSchema)
def get_capability(capability_id: str, request: Request) -> CapabilityDetailResponseSchema:
    services = _services(request)
    return CapabilityDetailResponseSchema(
        capability=CapabilitySchema.from_definition(services.capability_registry.require(capability_id))
    )

