"""Shared dependency helpers for FastAPI route modules."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import HTTPException, Request

if TYPE_CHECKING:
    from presto.web_api.server import ServiceContainer


def get_services(request: Request) -> "ServiceContainer":
    services = getattr(request.app.state, "services", None)
    if services is None:
        raise HTTPException(status_code=500, detail="Service container is not initialized.")
    return services
