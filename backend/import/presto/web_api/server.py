"""FastAPI application for Electron/web frontend bridge."""

from __future__ import annotations

from dataclasses import dataclass
import logging
import os
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from presto.app.ai_rename_service import AiRenameService
from presto.app.orchestrator import ImportOrchestrator
from presto.config.store import ConfigStore
from presto.domain.errors import PrestoError
from presto.infra.ai_naming_client import AiNamingClient
from presto.infra.keychain_store import KeychainStore
from presto.infra.protools_ui_automation import ProToolsUiAutomation
from presto.infra.ptsl_gateway import ProToolsGateway
from presto.util.logging_setup import setup_logging
from presto.web_api.api_entries import register_api_entries
from presto.web_api.error_catalog import build_friendly_error
from presto.web_api.task_registry import TaskRegistry


@dataclass
class ServiceContainer:
    """Long-lived services shared across API routes."""

    config_store: ConfigStore
    gateway: ProToolsGateway
    ui_automation: ProToolsUiAutomation
    keychain_store: KeychainStore
    ai_rename_service: AiRenameService
    import_orchestrator: ImportOrchestrator
    task_registry: TaskRegistry
    logger: logging.Logger


def build_services(app_support_dir: Path | None = None) -> ServiceContainer:
    """Create app services for the Web/Electron frontend and local API."""

    if app_support_dir is None:
        env_dir = os.environ.get("PRESTO_APP_SUPPORT_DIR", "").strip()
        if env_dir:
            app_support_dir = Path(env_dir).expanduser()

    config_store = ConfigStore(app_support_dir=app_support_dir)
    logger = setup_logging(config_store.logs_dir)

    gateway = ProToolsGateway()
    ui_automation = ProToolsUiAutomation()
    keychain_store = KeychainStore()
    ai_naming_client = AiNamingClient()
    ai_rename_service = AiRenameService(
        client=ai_naming_client,
        keychain_store=keychain_store,
        logger=logger,
    )

    import_orchestrator = ImportOrchestrator(
        gateway=gateway,
        ui_automation=ui_automation,
        logger=logger,
    )

    return ServiceContainer(
        config_store=config_store,
        gateway=gateway,
        ui_automation=ui_automation,
        keychain_store=keychain_store,
        ai_rename_service=ai_rename_service,
        import_orchestrator=import_orchestrator,
        task_registry=TaskRegistry(),
        logger=logger,
    )


def _error_payload(code: str, message: str, details: Any = None) -> dict[str, Any]:
    details_dict = details if isinstance(details, dict) else ({"raw": details} if details is not None else None)
    return build_friendly_error(code, message, details=details_dict)


def create_app(services: ServiceContainer | None = None) -> FastAPI:
    """Create configured FastAPI app."""

    app = FastAPI(
        title="Presto Local API",
        version="1.0.0",
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.state.services = services or build_services()

    @app.exception_handler(PrestoError)
    async def handle_pt_error(_request: Request, exc: PrestoError):
        return JSONResponse(status_code=400, content=_error_payload(exc.code, exc.message))

    @app.exception_handler(HTTPException)
    async def handle_http_error(_request: Request, exc: HTTPException):
        detail = exc.detail
        if isinstance(detail, dict):
            code = str(detail.get("error_code") or detail.get("code") or "HTTP_ERROR")
            message = str(detail.get("message") or "HTTP error")
            extra = {key: value for key, value in detail.items() if key not in {"error_code", "code", "message"}}
            return JSONResponse(
                status_code=exc.status_code,
                content=_error_payload(code, message, details=(extra or None)),
            )
        return JSONResponse(
            status_code=exc.status_code,
            content=_error_payload("HTTP_ERROR", str(detail)),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception):
        logger = getattr(request.app.state.services, "logger", logging.getLogger(__name__))
        logger.exception("Unhandled API exception")
        return JSONResponse(
            status_code=500,
            content=_error_payload("UNEXPECTED_ERROR", str(exc)),
        )

    @app.on_event("shutdown")
    async def _close_gateway() -> None:
        svc = app.state.services
        try:
            svc.gateway.close()
        except Exception:
            svc.logger.exception("Failed to close PTSL gateway on API shutdown")

    register_api_entries(app, prefix="/api/v1")

    return app
