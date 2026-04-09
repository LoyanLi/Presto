from __future__ import annotations

from dataclasses import dataclass
from threading import Lock
from typing import Any, Callable


class ImportAnalysisStore:
    def __init__(self) -> None:
        self._values: dict[str, dict[str, Any]] = {}
        self.hits = 0
        self.misses = 0

    def get_or_set(self, key: str, builder: Callable[[], dict[str, Any]]) -> dict[str, Any]:
        cached = self._values.get(key)
        if cached is not None:
            self.hits += 1
            return cached

        self.misses += 1
        value = builder()
        self._values[key] = value
        return value


class ManagedJobHandle:
    def cancel(self) -> None:
        raise NotImplementedError


@dataclass
class ThreadedJobHandle(ManagedJobHandle):
    cancel_event: Any
    worker: Any
    capability: str

    def cancel(self) -> None:
        self.cancel_event.set()


class InMemoryJobHandleRegistry:
    def __init__(self) -> None:
        self._handles: dict[str, ManagedJobHandle] = {}
        self._lock = Lock()

    def register(self, job_id: str, handle: ManagedJobHandle) -> None:
        with self._lock:
            self._handles[job_id] = handle

    def get(self, job_id: str) -> ManagedJobHandle | None:
        with self._lock:
            return self._handles.get(job_id)

    def pop(self, job_id: str) -> ManagedJobHandle | None:
        with self._lock:
            return self._handles.pop(job_id, None)

    def cancel(self, job_id: str) -> bool:
        handle = self.get(job_id)
        if handle is None:
            return False
        handle.cancel()
        return True
