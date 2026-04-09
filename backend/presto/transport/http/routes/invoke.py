from __future__ import annotations

from fastapi import APIRouter, Request

from ....application.handlers.invoker import execute_capability
from ....application.service_container import ServiceContainer
from ..schemas.capabilities import (
    CapabilityInvokeRequestSchema,
    CapabilityInvokeResponseSchema,
    CapabilityInvokeSuccessResponseSchema,
)


router = APIRouter(tags=["capabilities"])


def _services(request: Request) -> ServiceContainer:
    return request.app.state.services


@router.post("/capabilities/invoke", response_model=CapabilityInvokeResponseSchema)
def invoke_capability(request: Request, body: CapabilityInvokeRequestSchema) -> CapabilityInvokeResponseSchema:
    services = _services(request)
    data = execute_capability(
        services,
        body.capability,
        body.payload,
        request_id=body.requestId,
    )
    return CapabilityInvokeSuccessResponseSchema(
        success=True,
        requestId=body.requestId,
        capability=body.capability,
        data=data,
    )
