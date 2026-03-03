"""importApi entry routes, aligned with frontend import API module."""

from __future__ import annotations

from fastapi import APIRouter

from presto.web_api.routes_common import router as common_router
from presto.web_api.routes_import import router as import_router


router = APIRouter()
router.include_router(common_router)
router.include_router(import_router)
