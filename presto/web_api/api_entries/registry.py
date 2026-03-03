"""Registry for backend API entries mapped to frontend API entry names."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

from fastapi import APIRouter, FastAPI

from presto.web_api.api_entries.import_api import router as import_api_router


@dataclass(frozen=True)
class ApiEntry:
    frontend_entry: str
    router: APIRouter


API_ENTRIES: tuple[ApiEntry, ...] = (
    ApiEntry(frontend_entry="importApi", router=import_api_router),
)


def register_api_entries(
    app: FastAPI,
    *,
    prefix: str = "/api/v1",
    enabled_entries: Iterable[str] | None = None,
) -> None:
    allowed = set(enabled_entries) if enabled_entries is not None else None
    for entry in API_ENTRIES:
        if allowed is not None and entry.frontend_entry not in allowed:
            continue
        app.include_router(entry.router, prefix=prefix, tags=[entry.frontend_entry])
