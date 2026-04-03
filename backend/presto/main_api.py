"""Single backend entrypoint skeleton for Presto."""

from __future__ import annotations

import argparse

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
import uvicorn

from presto.application.service_container import build_service_container
from presto.domain.errors import PrestoError
from presto.transport.http.routes import router as http_router
from presto.transport.http.schemas.errors import ErrorResponseSchema


def create_app() -> FastAPI:
    app = FastAPI(title="Presto Backend API", version="0.1.0")
    app.state.services = build_service_container()
    app.include_router(http_router, prefix="/api/v1")

    @app.exception_handler(PrestoError)
    async def handle_presto_error(request: Request, exc: PrestoError) -> JSONResponse:
        _ = request
        services = app.state.services
        payload = services.error_normalizer.normalize(exc)
        return JSONResponse(status_code=exc.status_code, content=ErrorResponseSchema.from_payload(payload).model_dump())

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        _ = request
        services = app.state.services
        payload = services.error_normalizer.normalize(exc)
        return JSONResponse(status_code=500, content=ErrorResponseSchema.from_payload(payload).model_dump())

    return app


app = create_app()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run the Presto backend API skeleton")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind")
    parser.add_argument("--reload", action="store_true", help="Enable auto reload")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    uvicorn.run("presto.main_api:app", host=args.host, port=args.port, reload=args.reload, log_level="info")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
