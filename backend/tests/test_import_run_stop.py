from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
import unittest

from fastapi import HTTPException

from presto.domain.export_models import ExportCancelToken
from presto.web_api.routes_import import import_run_stop
from presto.web_api.task_registry import TaskRecord, TaskRegistry


class ImportRunStopRouteTests(unittest.TestCase):
    def _make_request(self, task_registry: TaskRegistry):
        services = SimpleNamespace(task_registry=task_registry)
        return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(services=services)))

    def test_import_run_stop_marks_cancelled(self) -> None:
        registry = TaskRegistry()
        token = ExportCancelToken()
        registry.create(
            TaskRecord(
                task_id="import_1",
                task_type="import",
                status="running",
                progress=42.0,
                current_index=4,
                total=10,
                current_name="kick.wav",
                created_at=datetime.now(),
                cancel_token=token,
            )
        )

        payload = import_run_stop("import_1", self._make_request(registry))
        self.assertTrue(payload["success"])
        task = registry.get("import_1")
        assert task is not None
        self.assertEqual(task.status, "cancelled")
        self.assertTrue(token.cancelled)

    def test_import_run_stop_raises_400_when_not_running(self) -> None:
        registry = TaskRegistry()
        registry.create(
            TaskRecord(
                task_id="import_1",
                task_type="import",
                status="completed",
                progress=100.0,
                current_index=10,
                total=10,
                current_name="",
                created_at=datetime.now(),
            )
        )

        with self.assertRaises(HTTPException) as ctx:
            import_run_stop("import_1", self._make_request(registry))
        self.assertEqual(ctx.exception.status_code, 400)


if __name__ == "__main__":
    unittest.main()
