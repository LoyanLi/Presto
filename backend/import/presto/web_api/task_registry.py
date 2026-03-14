"""In-memory task registry for import/export async jobs."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from threading import Lock
from typing import Any

from presto.domain.export_models import ExportCancelToken


@dataclass
class TaskRecord:
    task_id: str
    task_type: str
    status: str
    progress: float
    current_index: int
    total: int
    current_name: str
    created_at: datetime
    stage: str = ""
    stage_current: int = 0
    stage_total: int = 0
    stage_progress: float = 0.0
    started_at: datetime | None = None
    finished_at: datetime | None = None
    result: dict[str, Any] | None = None
    error_code: str | None = None
    error_message: str | None = None
    cancel_token: ExportCancelToken | None = None


class TaskRegistry:
    """Thread-safe in-memory task state."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._tasks: dict[str, TaskRecord] = {}

    def create(self, task: TaskRecord) -> None:
        with self._lock:
            self._tasks[task.task_id] = task

    def get(self, task_id: str) -> TaskRecord | None:
        with self._lock:
            return self._tasks.get(task_id)

    def list_by_type(self, task_type: str) -> list[TaskRecord]:
        with self._lock:
            values = [task for task in self._tasks.values() if task.task_type == task_type]
        return sorted(values, key=lambda item: item.created_at, reverse=True)

    def update(self, task_id: str, **changes: Any) -> TaskRecord | None:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return None
            for key, value in changes.items():
                setattr(task, key, value)
            return task

    def delete(self, task_id: str) -> bool:
        with self._lock:
            if task_id not in self._tasks:
                return False
            del self._tasks[task_id]
            return True
