from __future__ import annotations

from fastapi import APIRouter, Request

from ....domain.capabilities import DEFAULT_DAW_TARGET
from ....application.service_container import ServiceContainer
from ..schemas.capabilities import HealthResponseSchema


router = APIRouter(tags=["system"])


def _services(request: Request) -> ServiceContainer:
    return request.app.state.services


@router.get("/health", response_model=HealthResponseSchema)
def health(request: Request) -> HealthResponseSchema:
    services = _services(request)
    return HealthResponseSchema(
        backend_ready=services.backend_ready,
        daw_connected=False,
        active_daw=services.target_daw or DEFAULT_DAW_TARGET,
    )
