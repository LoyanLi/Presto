from fastapi import APIRouter

from .capabilities import router as capabilities_router
from .health import router as health_router
from .invoke import router as invoke_router
from .jobs import router as jobs_router


def build_router() -> APIRouter:
    router = APIRouter()
    router.include_router(health_router)
    router.include_router(capabilities_router)
    router.include_router(invoke_router)
    router.include_router(jobs_router)
    return router


router = build_router()
