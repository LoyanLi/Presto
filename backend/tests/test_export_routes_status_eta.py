from __future__ import annotations

import asyncio
import sys
from datetime import datetime
from pathlib import Path

import pytest
from fastapi import HTTPException


EXPORT_BACKEND_ROOT = Path(__file__).resolve().parents[1] / "export"
if str(EXPORT_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(EXPORT_BACKEND_ROOT))

from api import routes  # type: ignore[import-not-found]


def test_export_status_includes_eta_seconds() -> None:
    task_id = "export_status_eta_test"
    routes.export_tasks[task_id] = {
        "task_id": task_id,
        "status": "running",
        "created_at": datetime.now(),
        "snapshots_count": 2,
        "progress": 43.5,
        "current_snapshot": 1,
        "current_snapshot_name": "Kick",
        "eta_seconds": 21,
        "result": None,
    }
    try:
        payload = asyncio.run(routes.get_export_status(task_id))
        assert payload["success"] is True
        assert payload["data"]["eta_seconds"] == 21
    finally:
        routes.export_tasks.pop(task_id, None)


def test_export_status_missing_task_returns_404() -> None:
    with pytest.raises(HTTPException) as ctx:
        asyncio.run(routes.get_export_status("missing-task"))
    assert ctx.value.status_code == 404
