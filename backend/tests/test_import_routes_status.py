from __future__ import annotations

from datetime import datetime
from types import SimpleNamespace
import unittest

from fastapi import HTTPException

from presto.web_api.routes_import import import_run_status
from presto.web_api.task_registry import TaskRecord, TaskRegistry


class ImportRunStatusRouteTests(unittest.TestCase):
    def _make_request(self, task_registry: TaskRegistry):
        services = SimpleNamespace(task_registry=task_registry)
        return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(services=services)))

    def test_import_run_status_includes_stage_fields(self) -> None:
        registry = TaskRegistry()
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
                stage="stage_color_batch",
                stage_current=2,
                stage_total=5,
                stage_progress=40.0,
                eta_seconds=42,
            )
        )

        payload = import_run_status("import_1", self._make_request(registry))
        data = payload["data"]

        self.assertEqual(data["stage"], "stage_color_batch")
        self.assertEqual(data["stage_current"], 2)
        self.assertEqual(data["stage_total"], 5)
        self.assertEqual(data["stage_progress"], 40.0)
        self.assertEqual(data["eta_seconds"], 42)

    def test_import_run_status_raises_404_for_missing_task(self) -> None:
        registry = TaskRegistry()

        with self.assertRaises(HTTPException) as ctx:
            import_run_status("missing", self._make_request(registry))

        self.assertEqual(ctx.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
