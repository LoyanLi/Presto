from __future__ import annotations

from fastapi import APIRouter, Request

from ....application.handlers.invoker import execute_capability
from ....application.service_container import ServiceContainer
from ..schemas.capabilities import HealthResponseSchema


router = APIRouter(tags=["system"])


def _services(request: Request) -> ServiceContainer:
    return request.app.state.services


@router.get("/health", response_model=HealthResponseSchema)
def health(request: Request) -> HealthResponseSchema:
    services = _services(request)
    data = execute_capability(
        services,
        "system.health",
        {},
        request_id="health-check",
    )
    return HealthResponseSchema(
        backend_ready=bool(data["backendReady"]),
        daw_connected=bool(data["dawConnected"]),
        active_daw=str(data["activeDaw"]),
    )
