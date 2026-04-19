from __future__ import annotations

from copy import deepcopy
from datetime import datetime, timezone
import os
from pathlib import Path
import json
import re
import shutil
import threading
import time
from typing import Any
from typing import TYPE_CHECKING
from uuid import uuid4

from ...domain.errors import JobNotFoundError, PrestoError, PrestoErrorPayload, PrestoValidationError
from ...domain.jobs import JobProgress, JobRecord, JobsUpdateRequest
from ...domain.capabilities import DEFAULT_DAW_TARGET
from ...domain.ports import CapabilityExecutionContext
from ..runtime_state import ImportAnalysisStore, ThreadedJobHandle
from .common import runtime_from_context
if TYPE_CHECKING:
    from ..service_container import ServiceContainer


SUPPORTED_AUDIO_SUFFIXES = {".wav", ".aif", ".aiff", ".mp3", ".m4a", ".flac", ".ogg"}
ANALYZE_CACHE_FILENAME = ".presto_ai_analyze.json"


ImportAnalysisCache = ImportAnalysisStore


def _analysis_cache(services: "ServiceContainer") -> ImportAnalysisCache:
    cache = services.import_analysis_store
    if cache is None:
        raise RuntimeError("import_analysis_store_not_configured")
    return cache


def _run_handles_get(services: "ServiceContainer", job_id: str) -> ThreadedJobHandle | None:
    registry = services.job_handle_registry
    if registry is None:
        raise RuntimeError("job_handle_registry_not_configured")
    handle = registry.get(job_id)
    return handle if isinstance(handle, ThreadedJobHandle) else None


def _run_handles_set(services: "ServiceContainer", job_id: str, handle: ThreadedJobHandle) -> None:
    registry = services.job_handle_registry
    if registry is None:
        raise RuntimeError("job_handle_registry_not_configured")
    registry.register(job_id, handle)


def _run_handles_pop(services: "ServiceContainer", job_id: str) -> ThreadedJobHandle | None:
    registry = services.job_handle_registry
    if registry is None:
        raise RuntimeError("job_handle_registry_not_configured")
    handle = registry.pop(job_id)
    return handle if isinstance(handle, ThreadedJobHandle) else None


def _validation_error(message: str, *, field: str) -> PrestoValidationError:
    return PrestoValidationError(
        message,
        details={
            "rawCode": "VALIDATION_ERROR",
            "rawMessage": message,
            "field": field,
        },
    )


def _normalize_directory_paths(
    raw_paths: list[Any],
    *,
    field: str,
    missing_message: str,
    missing_entry_message: str,
    path_label: str,
) -> list[Path]:
    if not isinstance(raw_paths, list) or not raw_paths:
        raise _validation_error(missing_message, field=field)

    normalized: list[Path] = []
    for raw_path in raw_paths:
        path_text = str(raw_path).strip()
        if not path_text:
            raise _validation_error(missing_entry_message, field=field)
        resolved_path = Path(path_text).expanduser().resolve()
        if not resolved_path.is_dir():
            raise _validation_error(f"{path_label} does not exist: {resolved_path}", field=field)
        normalized.append(resolved_path)

    return normalized


def _resolve_import_folder_paths(payload: dict[str, Any]) -> list[Path]:
    if "items" in payload:
        raise _validation_error("folderPaths is required.", field="folderPaths")

    return _normalize_directory_paths(
        payload.get("folderPaths"),
        field="folderPaths",
        missing_message="folderPaths is required.",
        missing_entry_message="folderPaths must contain non-empty paths.",
        path_label="folder",
    )


def _resolve_import_ordered_file_paths(payload: dict[str, Any], folder_paths: list[Path]) -> list[str]:
    ordered_file_paths = payload.get("orderedFilePaths")
    if ordered_file_paths is None:
        resolved = _iter_audio_files(folder_paths)
        if not resolved:
            raise _validation_error("folderPaths did not resolve any audio files.", field="folderPaths")
        return [str(path) for path in resolved]

    if not isinstance(ordered_file_paths, list) or not ordered_file_paths:
        raise _validation_error("orderedFilePaths is required when provided.", field="orderedFilePaths")

    resolved_roots = [folder_path.resolve() for folder_path in folder_paths]
    normalized: list[str] = []
    seen: set[str] = set()
    for file_path in ordered_file_paths:
        path_text = str(file_path).strip()
        if not path_text:
            raise _validation_error("orderedFilePaths must contain non-empty paths.", field="orderedFilePaths")
        resolved_path = Path(path_text).expanduser().resolve()
        if not resolved_path.is_file():
            raise _validation_error(f"ordered file does not exist: {resolved_path}", field="orderedFilePaths")
        if resolved_path.suffix.lower() not in SUPPORTED_AUDIO_SUFFIXES:
            raise _validation_error(
                f"orderedFilePaths must contain audio files: {resolved_path}",
                field="orderedFilePaths",
            )
        if not any(root == resolved_path or root in resolved_path.parents for root in resolved_roots):
            raise _validation_error(
                f"orderedFilePaths must stay inside folderPaths: {resolved_path}",
                field="orderedFilePaths",
            )
        normalized_path = str(resolved_path)
        if normalized_path in seen:
            continue
        seen.add(normalized_path)
        normalized.append(normalized_path)

    if not normalized:
        raise _validation_error("orderedFilePaths did not resolve any audio files.", field="orderedFilePaths")

    return normalized


def _resolve_import_mode(payload: dict[str, Any]) -> str:
    normalized = str(payload.get("importMode", "copy") or "copy").strip().lower()
    if normalized not in {"copy", "link"}:
        raise _validation_error("importMode must be either 'copy' or 'link'.", field="importMode")
    return normalized


def _resolve_source_folders(payload: dict[str, Any]) -> list[Path]:
    if "items" in payload:
        raise _validation_error("sourceFolders is required.", field="sourceFolders")

    return _normalize_directory_paths(
        payload.get("sourceFolders"),
        field="sourceFolders",
        missing_message="sourceFolders is required.",
        missing_entry_message="sourceFolders must contain non-empty paths.",
        path_label="source folder",
    )


def _find_matching_root(file_path: Path, source_folders: list[Path]) -> Path:
    resolved_file = file_path.resolve()
    for source_folder in sorted(source_folders, key=lambda path: len(str(path.resolve())), reverse=True):
        resolved_source = source_folder.resolve()
        if resolved_source == resolved_file or resolved_source in resolved_file.parents:
            return resolved_source
    return source_folders[0].resolve()


def _iter_audio_files(source_folders: list[Path]) -> list[Path]:
    audio_files: list[Path] = []
    for source_folder in source_folders:
        for entry in source_folder.rglob("*"):
            if entry.is_file() and entry.suffix.lower() in SUPPORTED_AUDIO_SUFFIXES:
                audio_files.append(entry.resolve())
    return sorted(audio_files, key=lambda item: str(item))


def _humanize_stem(stem: str) -> str:
    tokens = [token for token in stem.replace("-", " ").replace("_", " ").split(" ") if token]
    if not tokens:
        return stem
    return " ".join(token[:1].upper() + token[1:] for token in tokens)


def _proposal_for_file(
    file_path: Path,
    source_folder: Path,
    *,
    categories: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    original_stem = file_path.stem
    ai_name = _humanize_stem(original_stem)
    return {
        "filePath": str(file_path.resolve()),
        "categoryId": _infer_category_id(file_path, source_folder, categories=categories),
        "aiName": ai_name,
        "finalName": ai_name,
        "status": "ready",
        "errorMessage": None,
    }


def _json_dumps(payload: dict[str, Any]) -> str:
    return json.dumps(payload, indent=2, ensure_ascii=True)


def _normalize_category_token(value: str) -> str:
    return value.strip().lower().replace(" ", "").replace("_", "").replace("-", "")


def _infer_category_id(
    file_path: Path,
    source_folder: Path,
    *,
    categories: list[dict[str, Any]] | None = None,
) -> str:
    if categories:
        normalized_categories: list[tuple[str, set[str]]] = []
        for category in categories:
            if not isinstance(category, dict):
                continue
            category_id = str(category.get("id", "")).strip()
            category_name = str(category.get("name", "")).strip()
            if not category_id and not category_name:
                continue
            tokens = {
                token
                for token in (
                    _normalize_category_token(category_id),
                    _normalize_category_token(category_name),
                )
                if token
            }
            if tokens:
                normalized_categories.append((category_id or category_name, tokens))

        segments = [segment for segment in file_path.resolve().parts[-4:-1] if segment]
        for segment in segments:
            token = _normalize_category_token(segment)
            if not token:
                continue
            for category_id, tokens in normalized_categories:
                if token in tokens:
                    return category_id

        source_token = _normalize_category_token(source_folder.name)
        if source_token:
            for category_id, tokens in normalized_categories:
                if source_token in tokens:
                    return category_id

        if normalized_categories:
            return normalized_categories[0][0]

    return "drums"


def _build_cache_rows(folder: Path, rows_payload: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized_rows = []
    for row in rows_payload:
        if not isinstance(row, dict):
            continue
        file_path = str(row.get("filePath", "")).strip()
        if not file_path:
            continue
        resolved_path = Path(file_path).expanduser().resolve()
        if resolved_path.suffix.lower() not in SUPPORTED_AUDIO_SUFFIXES:
            continue
        try:
            relative_path = resolved_path.relative_to(folder.resolve())
        except ValueError:
            continue
        normalized_rows.append(
            {
                "file_path": str(resolved_path),
                "category_id": str(row.get("categoryId", "")).strip() or folder.name,
                "ai_name": row.get("aiName"),
                "final_name": row.get("finalName"),
                "status": row.get("status", "ready"),
                "error_message": row.get("errorMessage"),
                "relative_path": relative_path.as_posix(),
            }
        )
    return normalized_rows


def _deserialize_cached_row(raw_row: dict[str, Any], resolved_path: Path, fallback_category_id: str) -> dict[str, Any]:
    ai_name = str(raw_row.get("ai_name", "")).strip() or _humanize_stem(resolved_path.stem)
    final_name = str(raw_row.get("final_name", "")).strip() or ai_name
    status = raw_row.get("status", "ready")
    if status not in {"ready", "failed", "skipped"}:
        status = "ready"
    return {
        "filePath": str(resolved_path),
        "categoryId": str(raw_row.get("category_id", "")).strip() or fallback_category_id,
        "aiName": ai_name,
        "finalName": final_name,
        "status": status,
        "errorMessage": raw_row.get("error_message"),
    }


def _load_analyze_cache(source_folders: list[Path]) -> tuple[dict[str, dict[str, Any]], int, int]:
    resolved_rows: dict[str, dict[str, Any]] = {}
    cache_files = 0
    cache_hits = 0
    for folder in source_folders:
        cache_path = folder / ANALYZE_CACHE_FILENAME
        if not cache_path.exists():
            continue
        try:
            payload = json.loads(cache_path.read_text())
        except Exception:
            continue
        proposals = payload.get("proposals")
        if not isinstance(proposals, list):
            continue
        cache_files += 1
        for proposal in proposals:
            if not isinstance(proposal, dict):
                continue
            absolute_path = str(proposal.get("file_path", "")).strip()
            relative_path = str(proposal.get("relative_path", "")).strip()
            resolved_path = None
            if absolute_path:
                resolved_path = Path(absolute_path).expanduser().resolve()
            elif relative_path:
                resolved_path = (folder / relative_path).resolve()
            if resolved_path is None:
                continue
            fallback_category_id = folder.name
            row = _deserialize_cached_row(proposal, resolved_path, fallback_category_id)
            resolved_rows[str(resolved_path)] = row
            cache_hits += 1
    return resolved_rows, cache_files, cache_hits


def analyze_import(services: "ServiceContainer", payload: dict[str, Any]) -> dict[str, Any]:
    source_folders = _resolve_source_folders(payload)
    categories = payload.get("categories")
    analyze_cache_enabled = payload.get("analyzeCacheEnabled", True)

    cached_rows: dict[str, dict[str, Any]] = {}
    cache_files = 0
    cache_hits = 0
    if analyze_cache_enabled:
        cached_rows, cache_files, cache_hits = _load_analyze_cache(source_folders)

    audio_files = _iter_audio_files(source_folders)
    ordered_file_paths = [str(path) for path in audio_files]
    rows = []
    for file_path in audio_files:
        normalized_key = str(file_path.resolve())
        cached = cached_rows.get(normalized_key)
        if cached is None:
            source_folder = _find_matching_root(file_path, source_folders)
            cached = _proposal_for_file(file_path, source_folder, categories=categories)
        rows.append(cached)

    return {
        "folderPaths": [str(folder.resolve()) for folder in source_folders],
        "orderedFilePaths": ordered_file_paths,
        "rows": rows,
        "cache": {"files": cache_files, "hits": cache_hits},
    }


def analyze_import_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return analyze_import(runtime_from_context(ctx), payload)


def persist_import_analysis_cache(services: "ServiceContainer", payload: dict[str, Any]) -> dict[str, Any]:
    del services
    source_folders = _resolve_source_folders(payload)
    rows_payload = payload.get("rows")
    if not isinstance(rows_payload, list):
        raise _validation_error("rows is required.", field="rows")

    saved = 0
    for folder in source_folders:
        folder_rows = _build_cache_rows(folder, rows_payload)
        if not folder_rows:
            continue
        cache_path = folder / ANALYZE_CACHE_FILENAME
        payload_data = {
            "version": 1,
            "generated_at": _utc_now(),
            "folder": str(folder),
            "total": len(folder_rows),
            "proposals": folder_rows,
        }
        folder.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(_json_dumps(payload_data))
        saved += 1

    return {"saved": True, "cacheFiles": saved}


def persist_import_analysis_cache_payload(
    ctx: CapabilityExecutionContext,
    payload: dict[str, Any],
) -> dict[str, Any]:
    return persist_import_analysis_cache(runtime_from_context(ctx), payload)


def finalize_import(services: "ServiceContainer", payload: dict[str, Any]) -> dict[str, Any]:
    _ = services
    proposals_payload = payload.get("proposals")
    if not isinstance(proposals_payload, list):
        raise _validation_error("proposals is required.", field="proposals")
    manual_name_by_path = payload.get("manualNameByPath", {})
    if not isinstance(manual_name_by_path, dict):
        raise _validation_error("manualNameByPath must be a mapping.", field="manualNameByPath")

    proposals: list[dict[str, Any]] = []
    resolved_items: list[dict[str, Any]] = []
    for proposal in proposals_payload:
        if not isinstance(proposal, dict):
            raise _validation_error("Each proposal must be an object.", field="proposals")
        file_path = str(proposal.get("filePath", ""))
        category_id = str(proposal.get("categoryId", ""))
        original_stem = str(proposal.get("originalStem", ""))
        ai_name = proposal.get("aiName")
        final_name = manual_name_by_path.get(file_path) or proposal.get("finalName") or ai_name or original_stem
        proposal_data = {
            "filePath": file_path,
            "categoryId": category_id,
            "originalStem": original_stem,
            "aiName": ai_name,
            "finalName": final_name,
            "status": proposal.get("status", "ready"),
            "errorMessage": proposal.get("errorMessage"),
        }
        proposals.append(proposal_data)
        resolved_items.append(
            {
                "filePath": file_path,
                "categoryId": category_id,
                "targetTrackName": final_name,
            }
        )

    return {"proposals": proposals, "resolvedItems": resolved_items}


def plan_import_run_items(services: "ServiceContainer", payload: dict[str, Any]) -> dict[str, Any]:
    del services
    rows_payload = payload.get("rows")
    if not isinstance(rows_payload, list):
        raise _validation_error("rows is required.", field="rows")

    imported_track_names = payload.get("importedTrackNames")
    if not isinstance(imported_track_names, list):
        raise _validation_error("importedTrackNames is required.", field="importedTrackNames")

    categories_payload = payload.get("categories")
    categories = categories_payload if isinstance(categories_payload, list) else []
    color_slot_by_category_id: dict[str, int | None] = {}
    for category in categories:
        if not isinstance(category, dict):
            continue
        category_id = str(category.get("id", "")).strip()
        if not category_id:
            continue
        color_slot = category.get("colorSlot")
        color_slot_by_category_id[category_id] = int(color_slot) if isinstance(color_slot, int) else None

    strip_after_import = bool(payload.get("stripAfterImport", False))
    fade_after_strip = bool(payload.get("fadeAfterStrip", False))
    items: list[dict[str, Any]] = []
    for index, row in enumerate(rows_payload):
        if not isinstance(row, dict):
            continue
        if str(row.get("status", "ready")) != "ready":
            continue
        current_track_name = str(imported_track_names[index] if index < len(imported_track_names) else "").strip()
        final_track_name = str(row.get("finalName", "") or current_track_name).strip()
        if not current_track_name or not final_track_name:
            continue
        category_id = str(row.get("categoryId", "")).strip()
        color_slot = color_slot_by_category_id.get(category_id)
        items.append(
            {
                "currentTrackName": current_track_name,
                "finalTrackName": final_track_name,
                "colorSlot": color_slot,
                "shouldApplyColor": color_slot is not None,
                "stripAfterImport": strip_after_import,
                "fadeAfterStrip": strip_after_import and fade_after_strip,
            }
        )

    return {"items": items}


def plan_import_run_items_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return plan_import_run_items(runtime_from_context(ctx), payload)


def _normalize_run_error(services: "ServiceContainer", error: Exception, *, capability_id: str) -> PrestoErrorPayload:
    payload = services.error_normalizer.normalize(
        error,
        capability=capability_id,
        adapter=str(getattr(services, "target_daw", DEFAULT_DAW_TARGET)),
    )
    details = dict(payload.details or {})
    details.setdefault("rawCode", payload.code)
    details.setdefault("rawMessage", payload.message)
    return PrestoErrorPayload(
        code=payload.code,
        message=payload.message,
        details=details,
        source=payload.source,
        retryable=payload.retryable,
        capability=payload.capability,
        adapter=payload.adapter,
    )


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _clone_job(record: JobRecord) -> JobRecord:
    return JobRecord(
        job_id=record.job_id,
        capability=record.capability,
        target_daw=record.target_daw,
        state=record.state,
        progress=JobProgress(
            phase=record.progress.phase,
            current=record.progress.current,
            total=record.progress.total,
            percent=record.progress.percent,
            message=record.progress.message,
        ),
        metadata=deepcopy(record.metadata),
        result=deepcopy(record.result),
        error=deepcopy(record.error),
        created_at=record.created_at,
        started_at=record.started_at,
        finished_at=record.finished_at,
    )


def _progress_payload(progress: JobProgress) -> dict[str, Any]:
    return {
        "phase": progress.phase,
        "current": progress.current,
        "total": progress.total,
        "percent": progress.percent,
        "message": progress.message,
    }


def _upsert_job(services: "ServiceContainer", job: JobRecord) -> None:
    try:
        services.job_manager.update(
            JobsUpdateRequest(
                job_id=job.job_id,
                state=job.state,
                progress=_progress_payload(job.progress),
                metadata=deepcopy(job.metadata),
                result=deepcopy(job.result),
                error=deepcopy(job.error),
                started_at=job.started_at,
                finished_at=job.finished_at,
            )
        )
    except JobNotFoundError:
        upsert = getattr(services.job_manager, "upsert", None)
        if callable(upsert):
            upsert(job)


def _set_job_cancelled(
    services: "ServiceContainer",
    job: JobRecord,
    *,
    message: str,
    result: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    job.state = "cancelled"
    job.progress = JobProgress(
        phase="cancelled",
        current=job.progress.current,
        total=job.progress.total,
        percent=job.progress.percent,
        message=message,
    )
    if result is not None:
        job.result = result
    if metadata is not None:
        job.metadata = metadata
    job.finished_at = _utc_now()
    _upsert_job(services, job)


def _set_job_running(
    services: "ServiceContainer",
    job: JobRecord,
    *,
    total: int,
    message: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    job.state = "running"
    job.started_at = job.started_at or _utc_now()
    job.progress = JobProgress(
        phase="running",
        current=0,
        total=max(total, 1),
        percent=0.0,
        message=message,
    )
    if metadata is not None:
        job.metadata = metadata
    _upsert_job(services, job)


def _set_job_succeeded(
    services: "ServiceContainer",
    job: JobRecord,
    *,
    result: dict[str, Any],
    total: int,
    message: str,
    metadata: dict[str, Any] | None = None,
) -> None:
    job.state = "succeeded"
    job.progress = JobProgress(
        phase="succeeded",
        current=max(total, 1),
        total=max(total, 1),
        percent=100.0,
        message=message,
    )
    job.result = result
    if metadata is not None:
        job.metadata = metadata
    job.finished_at = _utc_now()
    _upsert_job(services, job)


def _set_job_failed(
    services: "ServiceContainer",
    job: JobRecord,
    *,
    error: PrestoErrorPayload,
    result: dict[str, Any] | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    job.state = "failed"
    job.progress = JobProgress(
        phase="failed",
        current=job.progress.current,
        total=job.progress.total,
        percent=job.progress.percent,
        message=error.message,
    )
    job.error = error
    if result is not None:
        job.result = result
    if metadata is not None:
        job.metadata = metadata
    job.finished_at = _utc_now()
    _upsert_job(services, job)


def _request_cancel(services: "ServiceContainer", job_id: str) -> None:
    registry = services.job_handle_registry
    if registry is None:
        raise RuntimeError("job_handle_registry_not_configured")
    registry.cancel(job_id)


def _should_cancel(services: "ServiceContainer", job: JobRecord, cancel_event: threading.Event) -> bool:
    if cancel_event.is_set():
        return True

    current = services.job_manager.get(job.job_id)
    return current.state == "cancelled"


def _delay_between_items() -> float:
    try:
        delay_ms = int(os.environ.get("PRESTO_IMPORT_RUN_DELAY_MS", "0"))
    except ValueError:
        return 0.0
    return max(delay_ms, 0) / 1000.0


def _wait_for_file(path: Path, *, cancel_event: threading.Event, timeout_seconds: float = 300.0, poll_seconds: float = 0.1) -> bool:
    deadline = time.time() + max(timeout_seconds, 0.0)
    while time.time() <= deadline:
        if path.exists():
            return True
        if cancel_event.is_set():
            return False
        time.sleep(max(poll_seconds, 0.01))
    return path.exists()


def _run_import_job(
    services: "ServiceContainer",
    job_id: str,
    file_paths: list[str],
    import_mode: str,
    cancel_event: threading.Event,
) -> None:
    try:
        daw = getattr(services, "daw", None)
        if daw is None:
            raise PrestoError(
                "DAW_UNAVAILABLE",
                "DAW adapter is not configured.",
                source="runtime",
                retryable=False,
                capability="daw.import.run.start",
                adapter=str(getattr(services, "target_daw", DEFAULT_DAW_TARGET)),
                details={
                    "rawCode": "DAW_UNAVAILABLE",
                    "rawMessage": "DAW adapter is not configured.",
                },
            )

        import_audio_file = getattr(daw, "import_audio_file", None)
        if not callable(import_audio_file):
            raise PrestoError(
                "IMPORT_UNAVAILABLE",
                "DAW adapter does not implement import_audio_file.",
                source="runtime",
                retryable=False,
                capability="daw.import.run.start",
                adapter=str(getattr(services, "target_daw", DEFAULT_DAW_TARGET)),
                details={
                    "rawCode": "IMPORT_UNAVAILABLE",
                    "rawMessage": "DAW adapter does not implement import_audio_file.",
                },
            )

        job = _clone_job(services.job_manager.get(job_id))
        if _should_cancel(services, job, cancel_event):
            _set_job_cancelled(services, job, message="Import run cancelled before start.")
            return

        _set_job_running(services, job, total=len(file_paths), message="Import run is running.")

        delay_seconds = _delay_between_items()
        if _should_cancel(services, job, cancel_event):
            _set_job_cancelled(services, job, message="Import run cancelled.")
            return

        job.progress = JobProgress(
            phase="running",
            current=0,
            total=max(len(file_paths), 1),
            percent=0.0,
            message=f"Importing {len(file_paths)} file(s).",
        )
        _upsert_job(services, job)

        imported_track_names: list[str] = []
        total_files = max(len(file_paths), 1)
        for index, file_path in enumerate(file_paths, start=1):
            if delay_seconds > 0:
                time.sleep(delay_seconds)
                if _should_cancel(services, job, cancel_event):
                    _set_job_cancelled(services, job, message="Import run cancelled.")
                    return

            imported_track_name = str(import_audio_file(file_path, import_mode=import_mode) or "").strip()
            imported_track_names.append(imported_track_name)

            if _should_cancel(services, job, cancel_event):
                _set_job_cancelled(services, job, message="Import run cancelled.")
                return

            job.progress = JobProgress(
                phase="running",
                current=index,
                total=total_files,
                percent=round((index / total_files) * 100, 1),
                message=f"Imported {index} of {total_files} file(s).",
            )
            _upsert_job(services, job)

        _set_job_succeeded(
            services,
            job,
            total=len(file_paths),
            message="Import completed.",
            result={
                "folderPaths": job.result.get("folderPaths", []),
                "orderedFilePaths": file_paths,
                "importMode": import_mode,
                "importedTrackNames": imported_track_names,
                "successCount": len(imported_track_names),
                "failedCount": 0,
            },
        )
    except Exception as exc:
        job = _clone_job(services.job_manager.get(job_id))
        error = _normalize_run_error(services, exc, capability_id="daw.import.run.start")
        _set_job_failed(services, job, error=error)
    finally:
        _run_handles_pop(services, job_id)


def _ensure_run_daw_connected(
    services: "ServiceContainer",
    payload: dict[str, Any],
    *,
    capability_id: str,
) -> None:
    daw = getattr(services, "daw", None)
    if daw is None:
        raise PrestoError(
            "DAW_UNAVAILABLE",
            "DAW adapter is not configured.",
            source="runtime",
            retryable=False,
            capability=capability_id,
            adapter=str(getattr(services, "target_daw", DEFAULT_DAW_TARGET)),
            details={
                "rawCode": "DAW_UNAVAILABLE",
                "rawMessage": "DAW adapter is not configured.",
            },
        )

    is_connected = getattr(daw, "is_connected", None)
    already_connected = bool(is_connected()) if callable(is_connected) else False
    if already_connected:
        return

    connect = getattr(daw, "connect", None)
    if not callable(connect):
        return

    host = payload.get("host") if isinstance(payload, dict) else None
    port = payload.get("port") if isinstance(payload, dict) else None
    timeout_seconds = payload.get("timeoutSeconds") if isinstance(payload, dict) else None
    connect(host=host, port=port, timeout_seconds=timeout_seconds)


def _normalize_export_request(payload: dict[str, Any], *, capability_id: str) -> dict[str, Any]:
    output_path = str(payload.get("outputPath", "")).strip()
    file_name = str(payload.get("fileName", "")).strip()
    file_type = str(payload.get("fileType", "")).strip()
    if not output_path:
        raise _validation_error("outputPath is required.", field="outputPath")
    if not file_name:
        raise _validation_error("fileName is required.", field="fileName")
    if not file_type:
        raise _validation_error("fileType is required.", field="fileType")

    audio_payload = payload.get("audio")
    audio = audio_payload if isinstance(audio_payload, dict) else {}
    source_payload = payload.get("source")
    source = source_payload if isinstance(source_payload, dict) else {}
    video_payload = payload.get("video")
    video = video_payload if isinstance(video_payload, dict) else {}

    source_type = str(source.get("type", "physical_out")).strip().lower().replace("-", "_") or "physical_out"
    source_name = str(source.get("name", "Out 1-2")).strip() or "Out 1-2"

    return {
        "output_path": output_path,
        "file_name": file_name,
        "file_type": file_type,
        "source_type": source_type,
        "source_name": source_name,
        "offline": bool(payload.get("offline", True)),
        "audio_format": audio.get("format", "interleaved"),
        "bit_depth": audio.get("bitDepth", 24),
        "sample_rate": audio.get("sampleRate", 48000),
        "include_video": bool(video.get("includeVideo", False)),
        "import_after_bounce": bool(payload.get("importAfterBounce", False)),
    }


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def _compute_export_snapshot_progress(snapshot_index: int, total_snapshots: int, step_progress: float) -> float:
    safe_total = max(total_snapshots, 1)
    safe_step = _clamp(step_progress, 0.0, 100.0) / 100.0
    overall = ((max(snapshot_index, 0) + safe_step) / safe_total) * 100.0
    return _clamp(overall, 0.0, 100.0)


def _estimate_eta_seconds(
    *,
    elapsed_seconds: float,
    progress: float,
    min_progress_for_eta: float = 5.0,
    max_eta_seconds: int = 24 * 60 * 60,
) -> int | None:
    safe_progress = _clamp(progress, 0.0, 100.0)
    if elapsed_seconds <= 0 or safe_progress < min_progress_for_eta or safe_progress >= 100.0:
        return None

    remaining = elapsed_seconds * (100.0 - safe_progress) / safe_progress
    if remaining <= 0:
        return 0
    return int(round(min(remaining, float(max_eta_seconds))))


def _sanitize_export_component(value: Any, *, fallback: str) -> str:
    sanitized = "".join(char for char in str(value or "").strip() if char.isalnum() or char in (" ", "-", "_")).rstrip()
    return sanitized or fallback


_EXPORT_FILE_NAME_TEMPLATE_TOKENS = {
    "session",
    "sample_rate",
    "bit_depth",
    "date",
    "time",
    "datetime",
    "year",
    "month",
    "day",
    "snapshot",
    "source",
    "snapshot_index",
    "snapshot_count",
    "source_index",
    "source_count",
    "source_type",
    "source_suffix",
    "file_format",
}


def _bare_export_session_name(session_info: Any) -> str:
    session_name = str(getattr(session_info, "session_name", "") or getattr(session_info, "sessionName", "")).strip()
    if not session_name:
        session_name = Path(str(getattr(session_info, "session_path", "") or getattr(session_info, "sessionPath", ""))).stem
    return session_name or "Project"


def _normalize_export_file_name_source_type(value: Any) -> str:
    return _normalize_export_run_source_type(value)


def _resolve_export_file_name_rendered_at(rendered_at: Any) -> datetime:
    if isinstance(rendered_at, datetime):
        return rendered_at if rendered_at.tzinfo is not None else rendered_at.replace(tzinfo=timezone.utc)
    raw = str(rendered_at or "").strip()
    if raw:
        parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        return parsed if parsed.tzinfo is not None else parsed.replace(tzinfo=timezone.utc)
    return datetime.now(timezone.utc)


def _build_export_file_name_date_parts(rendered_at: Any) -> dict[str, str]:
    timestamp = _resolve_export_file_name_rendered_at(rendered_at).astimezone(timezone.utc)
    year = f"{timestamp.year:04d}"
    month = f"{timestamp.month:02d}"
    day = f"{timestamp.day:02d}"
    time_text = f"{timestamp.hour:02d}-{timestamp.minute:02d}-{timestamp.second:02d}"
    date_text = f"{year}-{month}-{day}"
    return {
        "date": date_text,
        "time": time_text,
        "datetime": f"{date_text}_{time_text}",
        "year": year,
        "month": month,
        "day": day,
    }


def _render_export_file_name_template(
    *,
    template: str,
    session_info: Any,
    snapshot_name: str,
    mix_source_name: str,
    mix_source_type: str,
    snapshot_index: int,
    snapshot_count: int,
    source_index: int,
    source_count: int,
    total_mix_sources: int,
    file_format: str,
    rendered_at: Any = None,
) -> str:
    source_name = str(mix_source_name or "").strip()
    date_parts = _build_export_file_name_date_parts(rendered_at)
    values = {
        "session": _bare_export_session_name(session_info),
        "sample_rate": str(getattr(session_info, "sample_rate", "") or getattr(session_info, "sampleRate", "")).strip(),
        "bit_depth": str(getattr(session_info, "bit_depth", "") or getattr(session_info, "bitDepth", "")).strip(),
        "date": date_parts["date"],
        "time": date_parts["time"],
        "datetime": date_parts["datetime"],
        "year": date_parts["year"],
        "month": date_parts["month"],
        "day": date_parts["day"],
        "snapshot": str(snapshot_name or "").strip(),
        "source": source_name,
        "snapshot_index": str(snapshot_index),
        "snapshot_count": str(snapshot_count),
        "source_index": str(source_index),
        "source_count": str(source_count),
        "source_type": _normalize_export_file_name_source_type(mix_source_type),
        "source_suffix": f"_{source_name}" if total_mix_sources > 1 and source_name else "",
        "file_format": str(file_format or "").strip().lower(),
    }
    return re.sub(r"\{([a-z_]+)\}", lambda match: str(values.get(match.group(1), "")), str(template or "")).strip()


def _validate_export_file_name_template(
    *,
    template: str,
    session_info: Any,
    snapshots: list[dict[str, Any]],
    mix_sources: list[dict[str, str]],
    file_format: str,
    rendered_at: Any = None,
) -> None:
    normalized_template = str(template or "").strip()
    if not normalized_template:
        raise _validation_error("exportSettings.fileNameTemplate is required.", field="exportSettings.fileNameTemplate")

    tokens = re.findall(r"\{([a-z_]+)\}", normalized_template)
    unsupported_token = next((token for token in tokens if token not in _EXPORT_FILE_NAME_TEMPLATE_TOKENS), None)
    if unsupported_token is not None:
        raise _validation_error(
            f"exportSettings.fileNameTemplate contains unsupported token {{{unsupported_token}}}.",
            field="exportSettings.fileNameTemplate",
        )

    normalized_mix_sources = mix_sources or [{"name": "", "type": "physical_out"}]
    rendered_names: set[str] = set()
    for snapshot_index, snapshot in enumerate(snapshots, start=1):
        for source_index, mix_source in enumerate(normalized_mix_sources, start=1):
            rendered_name = _render_export_file_name_template(
                template=normalized_template,
                session_info=session_info,
                snapshot_name=snapshot["name"],
                mix_source_name=mix_source["name"],
                mix_source_type=mix_source["type"],
                snapshot_index=snapshot_index,
                snapshot_count=len(snapshots),
                source_index=source_index,
                source_count=len(normalized_mix_sources),
                total_mix_sources=len(normalized_mix_sources),
                file_format=file_format,
                rendered_at=rendered_at,
            )
            safe_name = _sanitize_export_component(rendered_name, fallback="")
            if not safe_name:
                raise _validation_error(
                    "exportSettings.fileNameTemplate must render at least one filename character.",
                    field="exportSettings.fileNameTemplate",
                )
            dedupe_key = safe_name.casefold()
            if dedupe_key in rendered_names:
                raise _validation_error(
                    "exportSettings.fileNameTemplate produces duplicate file names. Add {snapshot}, {source}, or an index token.",
                    field="exportSettings.fileNameTemplate",
                )
            rendered_names.add(dedupe_key)


def _metadata_export_run(
    *,
    total_snapshots: int,
    current_snapshot: int,
    current_snapshot_name: str,
    eta_seconds: int | None,
    last_exported_file: str | None = None,
    exported_count: int = 0,
    current_mix_source_name: str | None = None,
    current_mix_source_index: int = 0,
    total_mix_sources: int = 0,
    current_file_progress_percent: float = 0.0,
    overall_progress_percent: float = 0.0,
) -> dict[str, Any]:
    return {
        "currentSnapshot": current_snapshot,
        "currentSnapshotName": current_snapshot_name,
        "totalSnapshots": total_snapshots,
        "currentMixSourceName": current_mix_source_name or "",
        "currentMixSourceIndex": current_mix_source_index,
        "totalMixSources": total_mix_sources,
        "currentFileProgressPercent": current_file_progress_percent,
        "overallProgressPercent": overall_progress_percent,
        "etaSeconds": eta_seconds,
        "lastExportedFile": last_exported_file,
        "exportedCount": exported_count,
    }


def _export_run_result(
    *,
    status: str,
    success: bool,
    exported_files: list[str],
    failed_snapshots: list[str],
    failed_snapshot_details: list[dict[str, str]] | None = None,
    total_duration: float,
    error_message: str | None,
) -> dict[str, Any]:
    return {
        "status": status,
        "success": success,
        "exportedFiles": list(exported_files),
        "failedSnapshots": list(failed_snapshots),
        "failedSnapshotDetails": list(failed_snapshot_details or []),
        "totalDuration": total_duration,
        "errorMessage": error_message,
    }


def _normalize_export_run_source_type(value: Any) -> str:
    normalized = str(value or "physicalOut").strip()
    compact = normalized.replace("-", "").replace("_", "").lower()
    if compact in {"physicalout", "physical"}:
        return "physical_out"
    if compact == "bus":
        return "bus"
    if compact == "output":
        return "output"
    if compact == "renderer":
        return "renderer"
    return "physical_out"


def _normalize_export_run_mix_source(payload: dict[str, Any], *, field: str) -> dict[str, str]:
    if not isinstance(payload, dict):
        raise _validation_error(f"{field} must contain objects.", field=field)
    mix_source_name = str(payload.get("name") or payload.get("mixSourceName") or payload.get("mix_source_name") or "").strip()
    if not mix_source_name:
        raise _validation_error(f"{field}.name is required.", field=field)
    return {
        "name": mix_source_name,
        "type": _normalize_export_run_source_type(
            payload.get("type") or payload.get("mixSourceType") or payload.get("mix_source_type") or "physicalOut"
        ),
    }


def _normalize_export_run_settings(payload: dict[str, Any]) -> dict[str, Any]:
    settings_payload = payload.get("exportSettings")
    if not isinstance(settings_payload, dict):
        settings_payload = payload.get("export_settings")
    if not isinstance(settings_payload, dict):
        raise _validation_error("exportSettings is required.", field="exportSettings")

    output_path = str(settings_payload.get("outputPath") or settings_payload.get("output_path") or "").strip()
    file_name_template = str(settings_payload.get("fileNameTemplate") or settings_payload.get("file_name_template") or "").strip()
    file_format = str(settings_payload.get("fileFormat") or settings_payload.get("file_format") or "wav").strip().lower() or "wav"
    raw_mix_sources = settings_payload.get("mixSources")
    if raw_mix_sources is None:
        raw_mix_sources = settings_payload.get("mix_sources")

    if not output_path:
        raise _validation_error("exportSettings.outputPath is required.", field="exportSettings.outputPath")
    if not file_name_template:
        raise _validation_error("exportSettings.fileNameTemplate is required.", field="exportSettings.fileNameTemplate")
    if file_format not in {"wav", "aiff", "mp3"}:
        raise _validation_error("exportSettings.fileFormat must be wav, aiff, or mp3.", field="exportSettings.fileFormat")
    unsupported_token = next((token for token in re.findall(r"\{([a-z_]+)\}", file_name_template) if token not in _EXPORT_FILE_NAME_TEMPLATE_TOKENS), None)
    if unsupported_token is not None:
        raise _validation_error(
            f"exportSettings.fileNameTemplate contains unsupported token {{{unsupported_token}}}.",
            field="exportSettings.fileNameTemplate",
        )

    normalized_mix_sources: list[dict[str, str]] = []
    if isinstance(raw_mix_sources, list):
        normalized_mix_sources = [
            _normalize_export_run_mix_source(mix_source, field="exportSettings.mixSources")
            for mix_source in raw_mix_sources
        ]
    else:
        mix_source_name = str(settings_payload.get("mixSourceName") or settings_payload.get("mix_source_name") or "").strip()
        if mix_source_name:
            normalized_mix_sources = [
                {
                    "name": mix_source_name,
                    "type": _normalize_export_run_source_type(
                        settings_payload.get("mixSourceType") or settings_payload.get("mix_source_type") or "physicalOut"
                    ),
                }
            ]

    if not normalized_mix_sources:
        raise _validation_error("exportSettings.mixSources is required.", field="exportSettings.mixSources")
    if file_format == "mp3" and len(normalized_mix_sources) > 1:
        raise _validation_error("exportSettings.mixSources must contain exactly one source when fileFormat is mp3.", field="exportSettings.mixSources")

    return {
        "output_path": str(Path(output_path).expanduser().resolve()),
        "file_name_template": file_name_template,
        "file_format": file_format,
        "mix_sources": normalized_mix_sources,
        "online_export": bool(settings_payload.get("onlineExport", settings_payload.get("online_export", False))),
    }


def _normalize_export_run_track_state(track_state: dict[str, Any]) -> dict[str, Any]:
    track_name = str(track_state.get("trackName", "")).strip()
    if not track_name:
        raise _validation_error("snapshot.trackStates[].trackName is required.", field="snapshots")
    return {
        "trackName": track_name,
        "isMuted": bool(track_state.get("isMuted", track_state.get("is_muted", False))),
        "isSoloed": bool(track_state.get("isSoloed", track_state.get("is_soloed", False))),
    }


def _normalize_export_run_request(payload: dict[str, Any]) -> dict[str, Any]:
    snapshots_payload = payload.get("snapshots")
    if not isinstance(snapshots_payload, list) or not snapshots_payload:
        raise _validation_error("snapshots is required.", field="snapshots")

    normalized_snapshots: list[dict[str, Any]] = []
    for snapshot in snapshots_payload:
        if not isinstance(snapshot, dict):
            raise _validation_error("snapshots must contain objects.", field="snapshots")
        snapshot_name = str(snapshot.get("name", "")).strip()
        if not snapshot_name:
            raise _validation_error("snapshot.name is required.", field="snapshots")
        track_states_payload = snapshot.get("trackStates")
        if not isinstance(track_states_payload, list):
            raise _validation_error("snapshot.trackStates is required.", field="snapshots")
        normalized_snapshots.append(
            {
                "name": snapshot_name,
                "trackStates": [
                    _normalize_export_run_track_state(track_state)
                    for track_state in track_states_payload
                    if isinstance(track_state, dict)
                ],
            }
        )

    def _optional_number(value: Any, field: str) -> float | None:
        if value is None:
            return None
        if isinstance(value, bool):
            raise _validation_error(f"{field} must be a number.", field=field)
        try:
            return float(value)
        except (TypeError, ValueError) as exc:
            raise _validation_error(f"{field} must be a number.", field=field) from exc

    return {
        "snapshots": normalized_snapshots,
        "settings": _normalize_export_run_settings(payload),
        "start_time": _optional_number(payload.get("startTime", payload.get("start_time")), "startTime"),
        "end_time": _optional_number(payload.get("endTime", payload.get("end_time")), "endTime"),
    }


def _apply_snapshot_states(daw: object, snapshot: dict[str, Any]) -> None:
    list_tracks = getattr(daw, "list_tracks", None)
    set_track_mute_state = getattr(daw, "set_track_mute_state", None)
    set_track_solo_state = getattr(daw, "set_track_solo_state", None)
    if not callable(list_tracks) or not callable(set_track_mute_state) or not callable(set_track_solo_state):
        raise PrestoError(
            "SNAPSHOT_APPLY_UNAVAILABLE",
            "DAW adapter does not implement snapshot application dependencies.",
            source="runtime",
            retryable=False,
            capability="daw.export.run.start",
            adapter=str(DEFAULT_DAW_TARGET),
            details={
                "rawCode": "SNAPSHOT_APPLY_UNAVAILABLE",
                "rawMessage": "DAW adapter does not implement snapshot application dependencies.",
            },
        )

    current_tracks = {getattr(track, "track_name", ""): track for track in list_tracks()}
    for track_state in snapshot["trackStates"]:
        track_name = track_state["trackName"]
        current_track = current_tracks.get(track_name)
        if current_track is None:
            continue

        target_muted = bool(track_state["isMuted"])
        target_soloed = bool(track_state["isSoloed"])
        if bool(getattr(current_track, "is_muted", False)) != target_muted:
            set_track_mute_state(track_name, target_muted)
        if bool(getattr(current_track, "is_soloed", False)) != target_soloed:
            set_track_solo_state(track_name, target_soloed)


def _update_export_run_progress(
    services: "ServiceContainer",
    job: JobRecord,
    *,
    started_at: float,
    snapshot_index: int,
    snapshot_name: str,
    total_snapshots: int,
    step_progress: float,
    message: str,
    last_exported_file: str | None = None,
    exported_count: int = 0,
    current_mix_source_name: str | None = None,
    current_mix_source_index: int = 0,
    total_mix_sources: int = 0,
    current_file_progress_percent: float = 0.0,
    overall_progress_percent: float | None = None,
) -> None:
    progress = (
        _clamp(overall_progress_percent, 0.0, 100.0)
        if overall_progress_percent is not None
        else _compute_export_snapshot_progress(snapshot_index, total_snapshots, step_progress)
    )
    eta_seconds = _estimate_eta_seconds(elapsed_seconds=time.time() - started_at, progress=progress)
    job.state = "running"
    job.started_at = job.started_at or _utc_now()
    job.progress = JobProgress(
        phase="running",
        current=min(max(snapshot_index + 1, 0), max(total_snapshots, 1)),
        total=max(total_snapshots, 1),
        percent=progress,
        message=message,
    )
    job.metadata = _metadata_export_run(
        total_snapshots=total_snapshots,
        current_snapshot=min(max(snapshot_index + 1, 0), total_snapshots),
        current_snapshot_name=snapshot_name,
        eta_seconds=eta_seconds,
        last_exported_file=last_exported_file,
        exported_count=exported_count,
        current_mix_source_name=current_mix_source_name,
        current_mix_source_index=current_mix_source_index,
        total_mix_sources=total_mix_sources,
        current_file_progress_percent=current_file_progress_percent,
        overall_progress_percent=progress,
    )
    _upsert_job(services, job)


def _compute_export_file_counts(*, total_snapshots: int, total_mix_sources: int) -> int:
    return max(total_snapshots, 1) * max(total_mix_sources, 1)


def _compute_export_overall_progress(
    *,
    completed_files: int,
    total_files: int,
    current_file_progress_percent: float = 0.0,
) -> float:
    safe_total_files = max(total_files, 1)
    safe_completed_files = max(completed_files, 0)
    safe_current_file_fraction = _clamp(current_file_progress_percent, 0.0, 100.0) / 100.0
    return _clamp(((safe_completed_files + safe_current_file_fraction) / safe_total_files) * 100.0, 0.0, 100.0)


def _run_export_workflow_job(
    services: "ServiceContainer",
    job_id: str,
    request: dict[str, Any],
    cancel_event: threading.Event,
) -> None:
    started_at = time.time()
    exported_files: list[str] = []
    failed_snapshots: list[str] = []
    failed_snapshot_details: list[dict[str, str]] = []
    last_exported_file: str | None = None
    total_snapshots = len(request["snapshots"])
    total_mix_sources = 0
    total_files = max(total_snapshots, 1)
    processed_file_count = 0

    try:
        daw = getattr(services, "daw", None)
        if daw is None:
            raise PrestoError(
                "DAW_UNAVAILABLE",
                "DAW adapter is not configured.",
                source="runtime",
                retryable=False,
                capability="daw.export.run.start",
                adapter=str(getattr(services, "target_daw", DEFAULT_DAW_TARGET)),
                details={
                    "rawCode": "DAW_UNAVAILABLE",
                    "rawMessage": "DAW adapter is not configured.",
                },
            )

        export_mix_with_progress = getattr(daw, "export_mix_with_progress", None)
        get_session_info = getattr(daw, "get_session_info", None)
        if not callable(export_mix_with_progress):
            raise PrestoError(
                "EXPORT_UNAVAILABLE",
                "DAW adapter does not implement export_mix_with_progress.",
                source="runtime",
                retryable=False,
                capability="daw.export.run.start",
                adapter=str(getattr(services, "target_daw", DEFAULT_DAW_TARGET)),
                details={
                    "rawCode": "EXPORT_UNAVAILABLE",
                    "rawMessage": "DAW adapter does not implement export_mix_with_progress.",
                },
            )
        if not callable(get_session_info):
            raise PrestoError(
                "SESSION_INFO_UNAVAILABLE",
                "DAW adapter does not implement get_session_info.",
                source="runtime",
                retryable=False,
                capability="daw.export.run.start",
                adapter=str(getattr(services, "target_daw", DEFAULT_DAW_TARGET)),
                details={
                    "rawCode": "SESSION_INFO_UNAVAILABLE",
                    "rawMessage": "DAW adapter does not implement get_session_info.",
                },
            )

        job = _clone_job(services.job_manager.get(job_id))
        if _should_cancel(services, job, cancel_event):
            _set_job_cancelled(
                services,
                job,
                message="Export workflow cancelled before start.",
                result=_export_run_result(
                    status="cancelled",
                    success=False,
                    exported_files=exported_files,
                    failed_snapshots=failed_snapshots,
                    total_duration=time.time() - started_at,
                    error_message="Export workflow was cancelled.",
                ),
                metadata=_metadata_export_run(
                    total_snapshots=total_snapshots,
                    current_snapshot=0,
                    current_snapshot_name="",
                    eta_seconds=0,
                    exported_count=0,
                ),
            )
            return

        _set_job_running(
            services,
            job,
            total=total_snapshots,
            message="Export workflow is running.",
            metadata=_metadata_export_run(
                total_snapshots=total_snapshots,
                current_snapshot=0,
                current_snapshot_name="",
                current_mix_source_name="",
                current_mix_source_index=0,
                total_mix_sources=0,
                current_file_progress_percent=0.0,
                overall_progress_percent=0.0,
                eta_seconds=None,
                exported_count=0,
            ),
        )

        settings = request["settings"]
        output_root = Path(settings["output_path"]).expanduser().resolve()
        output_root.mkdir(parents=True, exist_ok=True)
        session_info = get_session_info()
        export_rendered_at = datetime.now(timezone.utc)
        _validate_export_file_name_template(
            template=settings["file_name_template"],
            session_info=session_info,
            snapshots=request["snapshots"],
            mix_sources=settings["mix_sources"],
            file_format=settings["file_format"],
            rendered_at=export_rendered_at,
        )
        total_mix_sources = max(len(settings["mix_sources"]), 1)
        total_files = _compute_export_file_counts(total_snapshots=total_snapshots, total_mix_sources=total_mix_sources)

        for snapshot_index, snapshot in enumerate(request["snapshots"]):
            snapshot_name = snapshot["name"]
            job = _clone_job(services.job_manager.get(job_id))
            if _should_cancel(services, job, cancel_event):
                _set_job_cancelled(
                    services,
                    job,
                    message="Export workflow cancelled.",
                    result=_export_run_result(
                        status="cancelled",
                        success=False,
                        exported_files=exported_files,
                        failed_snapshots=failed_snapshots,
                        failed_snapshot_details=failed_snapshot_details,
                        total_duration=time.time() - started_at,
                        error_message="Export workflow was cancelled.",
                    ),
                    metadata=_metadata_export_run(
                        total_snapshots=total_snapshots,
                        current_snapshot=min(snapshot_index, total_snapshots),
                        current_snapshot_name=snapshot_name,
                        current_mix_source_name="",
                        current_mix_source_index=0,
                        total_mix_sources=total_mix_sources,
                        current_file_progress_percent=0.0,
                        overall_progress_percent=_compute_export_overall_progress(
                            completed_files=processed_file_count,
                            total_files=total_files,
                        ),
                        eta_seconds=0,
                        last_exported_file=last_exported_file,
                        exported_count=len(exported_files),
                    ),
                )
                return

            _update_export_run_progress(
                services,
                job,
                started_at=started_at,
                snapshot_index=snapshot_index,
                snapshot_name=snapshot_name,
                total_snapshots=total_snapshots,
                step_progress=5.0,
                message=f"Applying snapshot {snapshot_name}.",
                last_exported_file=last_exported_file,
                exported_count=len(exported_files),
                total_mix_sources=total_mix_sources,
                overall_progress_percent=_compute_export_overall_progress(
                    completed_files=processed_file_count,
                    total_files=total_files,
                ),
            )
            _apply_snapshot_states(daw, snapshot)
            time.sleep(0.5)
            job = _clone_job(services.job_manager.get(job_id))
            _update_export_run_progress(
                services,
                job,
                started_at=started_at,
                snapshot_index=snapshot_index,
                snapshot_name=snapshot_name,
                total_snapshots=total_snapshots,
                step_progress=35.0,
                message=f"Preparing export for {snapshot_name}.",
                last_exported_file=last_exported_file,
                exported_count=len(exported_files),
                total_mix_sources=total_mix_sources,
                overall_progress_percent=_compute_export_overall_progress(
                    completed_files=processed_file_count,
                    total_files=total_files,
                ),
            )

            file_extension = settings["file_format"]

            selected_mix_sources = settings["mix_sources"]
            for mix_source_index, mix_source in enumerate(selected_mix_sources):
                current_mix_source_index = mix_source_index + 1
                source_suffix = (
                    _sanitize_export_component(mix_source["name"], fallback=f"source_{mix_source_index + 1}")
                    if len(selected_mix_sources) > 1
                    else ""
                )
                safe_temp_name = _sanitize_export_component(
                    f"temp_export_{snapshot_name}_{source_suffix}_{int(time.time())}" if source_suffix else f"temp_export_{snapshot_name}_{int(time.time())}",
                    fallback=f"temp_export_{snapshot_index + 1}_{mix_source_index + 1}",
                )
                rendered_final_name = _render_export_file_name_template(
                    template=settings["file_name_template"],
                    session_info=session_info,
                    snapshot_name=snapshot_name,
                    mix_source_name=mix_source["name"],
                    mix_source_type=mix_source["type"],
                    snapshot_index=snapshot_index + 1,
                    snapshot_count=total_snapshots,
                    source_index=current_mix_source_index,
                    source_count=len(selected_mix_sources),
                    total_mix_sources=len(selected_mix_sources),
                    file_format=file_extension,
                    rendered_at=export_rendered_at,
                )
                safe_final_name = _sanitize_export_component(
                    rendered_final_name,
                    fallback=f"export_{snapshot_index + 1}_{mix_source_index + 1}",
                )
                temp_output_path = output_root / f"{safe_temp_name}.{file_extension}"
                final_output_path = output_root / f"{safe_final_name}.{file_extension}"

                try:
                    job = _clone_job(services.job_manager.get(job_id))
                    _update_export_run_progress(
                        services,
                        job,
                        started_at=started_at,
                        snapshot_index=snapshot_index,
                        snapshot_name=snapshot_name,
                        total_snapshots=total_snapshots,
                        step_progress=45.0,
                        message=f"Exporting snapshot {snapshot_name}.",
                        last_exported_file=last_exported_file,
                        exported_count=len(exported_files),
                        current_mix_source_name=mix_source["name"],
                        current_mix_source_index=current_mix_source_index,
                        total_mix_sources=total_mix_sources,
                        current_file_progress_percent=0.0,
                        overall_progress_percent=_compute_export_overall_progress(
                            completed_files=processed_file_count,
                            total_files=total_files,
                        ),
                    )

                    def _on_export_progress(progress_update: dict[str, Any]) -> None:
                        active_job = _clone_job(services.job_manager.get(job_id))
                        if active_job.state != "running":
                            return
                        current_file_progress = float(progress_update.get("progressPercent", 0.0) or 0.0)
                        _update_export_run_progress(
                            services,
                            active_job,
                            started_at=started_at,
                            snapshot_index=snapshot_index,
                            snapshot_name=snapshot_name,
                            total_snapshots=total_snapshots,
                            step_progress=45.0,
                            message=f"Exporting snapshot {snapshot_name}.",
                            last_exported_file=last_exported_file,
                            exported_count=len(exported_files),
                            current_mix_source_name=mix_source["name"],
                            current_mix_source_index=current_mix_source_index,
                            total_mix_sources=total_mix_sources,
                            current_file_progress_percent=current_file_progress,
                            overall_progress_percent=_compute_export_overall_progress(
                                completed_files=processed_file_count,
                                total_files=total_files,
                                current_file_progress_percent=current_file_progress,
                            ),
                        )

                    export_mix_with_progress(
                        output_path=str(output_root),
                        file_name=safe_temp_name,
                        file_type=file_extension.upper(),
                        source_type=mix_source["type"],
                        source_name=mix_source["name"],
                        file_destination="directory",
                        offline=not settings["online_export"],
                        audio_format="interleaved",
                        bit_depth=int(getattr(session_info, "bit_depth", 24) or 24),
                        sample_rate=int(getattr(session_info, "sample_rate", 48000) or 48000),
                        include_video=False,
                        import_after_bounce=False,
                        on_progress=_on_export_progress,
                    )
                except Exception as exc:
                    if snapshot_name not in failed_snapshots:
                        failed_snapshots.append(snapshot_name)
                    failed_snapshot_details.append(
                        {
                            "snapshotName": snapshot_name,
                            "mixSourceName": mix_source["name"],
                            "error": str(exc) or f"Export failed for {snapshot_name}.",
                        }
                    )
                    job = _clone_job(services.job_manager.get(job_id))
                    _update_export_run_progress(
                        services,
                        job,
                        started_at=started_at,
                        snapshot_index=snapshot_index,
                        snapshot_name=snapshot_name,
                        total_snapshots=total_snapshots,
                        step_progress=100.0,
                        message=f"Export failed for {snapshot_name}.",
                        last_exported_file=last_exported_file,
                        exported_count=len(exported_files),
                        current_mix_source_name=mix_source["name"],
                        current_mix_source_index=current_mix_source_index,
                        total_mix_sources=total_mix_sources,
                        current_file_progress_percent=100.0,
                        overall_progress_percent=_compute_export_overall_progress(
                            completed_files=processed_file_count,
                            total_files=total_files,
                            current_file_progress_percent=100.0,
                        ),
                    )
                    processed_file_count += 1
                    continue

                job = _clone_job(services.job_manager.get(job_id))
                if _should_cancel(services, job, cancel_event):
                    if temp_output_path.exists():
                        temp_output_path.unlink(missing_ok=True)
                    _set_job_cancelled(
                        services,
                        job,
                        message="Export workflow cancelled.",
                        result=_export_run_result(
                            status="cancelled",
                            success=False,
                            exported_files=exported_files,
                            failed_snapshots=failed_snapshots,
                            failed_snapshot_details=failed_snapshot_details,
                            total_duration=time.time() - started_at,
                            error_message="Export workflow was cancelled.",
                        ),
                        metadata=_metadata_export_run(
                            total_snapshots=total_snapshots,
                            current_snapshot=min(snapshot_index + 1, total_snapshots),
                            current_snapshot_name=snapshot_name,
                            current_mix_source_name=mix_source["name"],
                            current_mix_source_index=current_mix_source_index,
                            total_mix_sources=total_mix_sources,
                            current_file_progress_percent=100.0,
                            overall_progress_percent=_compute_export_overall_progress(
                                completed_files=processed_file_count,
                                total_files=total_files,
                                current_file_progress_percent=100.0,
                            ),
                            eta_seconds=0,
                            last_exported_file=last_exported_file,
                            exported_count=len(exported_files),
                        ),
                    )
                    return

                _update_export_run_progress(
                    services,
                    job,
                    started_at=started_at,
                    snapshot_index=snapshot_index,
                    snapshot_name=snapshot_name,
                    total_snapshots=total_snapshots,
                    step_progress=85.0,
                    message=f"Finalizing export for {snapshot_name}.",
                    last_exported_file=last_exported_file,
                    exported_count=len(exported_files),
                    current_mix_source_name=mix_source["name"],
                    current_mix_source_index=current_mix_source_index,
                    total_mix_sources=total_mix_sources,
                    current_file_progress_percent=100.0,
                    overall_progress_percent=_compute_export_overall_progress(
                        completed_files=processed_file_count,
                        total_files=total_files,
                        current_file_progress_percent=100.0,
                    ),
                )

                if not _wait_for_file(temp_output_path, cancel_event=cancel_event):
                    if snapshot_name not in failed_snapshots:
                        failed_snapshots.append(snapshot_name)
                    failed_snapshot_details.append(
                        {
                            "snapshotName": snapshot_name,
                            "mixSourceName": mix_source["name"],
                            "error": f"Export file missing for {snapshot_name}.",
                        }
                    )
                    job = _clone_job(services.job_manager.get(job_id))
                    _update_export_run_progress(
                        services,
                        job,
                        started_at=started_at,
                        snapshot_index=snapshot_index,
                        snapshot_name=snapshot_name,
                        total_snapshots=total_snapshots,
                        step_progress=100.0,
                        message=f"Export file missing for {snapshot_name}.",
                        last_exported_file=last_exported_file,
                        exported_count=len(exported_files),
                        current_mix_source_name=mix_source["name"],
                        current_mix_source_index=current_mix_source_index,
                        total_mix_sources=total_mix_sources,
                        current_file_progress_percent=100.0,
                        overall_progress_percent=_compute_export_overall_progress(
                            completed_files=processed_file_count,
                            total_files=total_files,
                            current_file_progress_percent=100.0,
                        ),
                    )
                    processed_file_count += 1
                    continue

                shutil.move(str(temp_output_path), str(final_output_path))
                exported_files.append(str(final_output_path))
                processed_file_count += 1
                last_exported_file = str(final_output_path)
                job = _clone_job(services.job_manager.get(job_id))
                _update_export_run_progress(
                    services,
                    job,
                    started_at=started_at,
                    snapshot_index=snapshot_index,
                    snapshot_name=snapshot_name,
                    total_snapshots=total_snapshots,
                    step_progress=100.0,
                    message=f"Exported {snapshot_name}.",
                    last_exported_file=last_exported_file,
                    exported_count=len(exported_files),
                    current_mix_source_name=mix_source["name"],
                    current_mix_source_index=current_mix_source_index,
                    total_mix_sources=total_mix_sources,
                    current_file_progress_percent=100.0,
                    overall_progress_percent=_compute_export_overall_progress(
                        completed_files=processed_file_count,
                        total_files=total_files,
                    ),
                )
                time.sleep(0.2)

        total_duration = time.time() - started_at
        success = len(failed_snapshots) == 0
        job = _clone_job(services.job_manager.get(job_id))
        _set_job_succeeded(
            services,
            job,
            total=total_snapshots,
            message="Export workflow completed." if success else "Export workflow completed with errors.",
            metadata=_metadata_export_run(
                total_snapshots=total_snapshots,
                current_snapshot=total_snapshots,
                current_snapshot_name=request["snapshots"][-1]["name"] if request["snapshots"] else "",
                current_mix_source_name=settings["mix_sources"][-1]["name"] if settings["mix_sources"] else "",
                current_mix_source_index=len(settings["mix_sources"]),
                total_mix_sources=total_mix_sources,
                current_file_progress_percent=100.0 if total_files > 0 else 0.0,
                overall_progress_percent=100.0 if total_files > 0 else 0.0,
                eta_seconds=0,
                last_exported_file=last_exported_file,
                exported_count=len(exported_files),
            ),
            result=_export_run_result(
                status="completed" if success else "completed_with_errors",
                success=success,
                exported_files=exported_files,
                failed_snapshots=failed_snapshots,
                failed_snapshot_details=failed_snapshot_details,
                total_duration=total_duration,
                error_message=(
                    None if success else f"Partial export failures: {', '.join(failed_snapshots)}"
                ),
            ),
        )
    except Exception as exc:
        job = _clone_job(services.job_manager.get(job_id))
        error = _normalize_run_error(services, exc, capability_id="daw.export.run.start")
        _set_job_failed(
            services,
            job,
            error=error,
            metadata=_metadata_export_run(
                total_snapshots=total_snapshots,
                current_snapshot=min(job.progress.current, total_snapshots),
                current_snapshot_name=str((job.metadata or {}).get("currentSnapshotName", "")),
                current_mix_source_name=str((job.metadata or {}).get("currentMixSourceName", "")),
                current_mix_source_index=int((job.metadata or {}).get("currentMixSourceIndex", 0) or 0),
                total_mix_sources=int((job.metadata or {}).get("totalMixSources", total_mix_sources) or 0),
                current_file_progress_percent=float((job.metadata or {}).get("currentFileProgressPercent", 0.0) or 0.0),
                overall_progress_percent=float((job.metadata or {}).get("overallProgressPercent", 0.0) or 0.0),
                eta_seconds=0,
                last_exported_file=last_exported_file,
                exported_count=len(exported_files),
            ),
            result=_export_run_result(
                status="failed",
                success=False,
                exported_files=exported_files,
                failed_snapshots=failed_snapshots,
                failed_snapshot_details=failed_snapshot_details,
                total_duration=time.time() - started_at,
                error_message=error.message,
            ),
        )
    finally:
        _run_handles_pop(services, job_id)


def _run_export_job(
    services: "ServiceContainer",
    job_id: str,
    request: dict[str, Any],
    cancel_event: threading.Event,
) -> None:
    try:
        daw = getattr(services, "daw", None)
        if daw is None:
            raise PrestoError(
                "DAW_UNAVAILABLE",
                "DAW adapter is not configured.",
                source="runtime",
                retryable=False,
                capability=request["capability_id"],
                adapter=str(getattr(services, "target_daw", DEFAULT_DAW_TARGET)),
                details={
                    "rawCode": "DAW_UNAVAILABLE",
                    "rawMessage": "DAW adapter is not configured.",
                },
            )

        export_mix = getattr(daw, "export_mix", None)
        if not callable(export_mix):
            raise PrestoError(
                "EXPORT_UNAVAILABLE",
                "DAW adapter does not implement export_mix.",
                source="runtime",
                retryable=False,
                capability=request["capability_id"],
                adapter=str(getattr(services, "target_daw", DEFAULT_DAW_TARGET)),
                details={
                    "rawCode": "EXPORT_UNAVAILABLE",
                    "rawMessage": "DAW adapter does not implement export_mix.",
                },
            )

        job = _clone_job(services.job_manager.get(job_id))
        if _should_cancel(services, job, cancel_event):
            _set_job_cancelled(services, job, message="Export cancelled before start.")
            return

        _set_job_running(services, job, total=1, message="Export is running.")

        export_request = dict(request)
        export_request.pop("capability_id", None)
        export_mix(**export_request)

        if _should_cancel(services, job, cancel_event):
            _set_job_cancelled(services, job, message="Export cancelled.")
            return

        _set_job_succeeded(
            services,
            job,
            total=1,
            message="Export completed.",
            result={
                "outputPath": request["output_path"],
                "fileName": request["file_name"],
                "fileType": request["file_type"],
                "source": {"type": request["source_type"], "name": request["source_name"]},
                "offline": request["offline"],
                "audio": {
                    "format": request["audio_format"],
                    "bitDepth": request["bit_depth"],
                    "sampleRate": request["sample_rate"],
                },
            },
        )
    except Exception as exc:
        job = _clone_job(services.job_manager.get(job_id))
        error = _normalize_run_error(services, exc, capability_id=request["capability_id"])
        _set_job_failed(services, job, error=error)
    finally:
        _run_handles_pop(services, job_id)


def start_export_run(services: "ServiceContainer", payload: dict[str, Any], *, capability_id: str) -> dict[str, Any]:
    _ensure_run_daw_connected(services, payload, capability_id=capability_id)
    if capability_id == "daw.export.run.start":
        request = _normalize_export_run_request(payload)
        job = JobRecord(
            job_id=f"export-{uuid4().hex[:12]}",
            capability=capability_id,
            target_daw=str(getattr(services, "target_daw", DEFAULT_DAW_TARGET)),
            state="queued",
            progress=JobProgress(
                phase="queued",
                current=0,
                total=max(len(request["snapshots"]), 1),
                percent=0.0,
                message="Export workflow queued.",
            ),
            metadata=_metadata_export_run(
                total_snapshots=len(request["snapshots"]),
                current_snapshot=0,
                current_snapshot_name="",
                eta_seconds=None,
                exported_count=0,
            ),
            result={
                "status": "queued",
                "success": False,
                "exportedFiles": [],
                "failedSnapshots": [],
            },
            created_at=_utc_now(),
        )
        _upsert_job(services, job)

        cancel_event = threading.Event()
        worker = threading.Thread(
            target=_run_export_workflow_job,
            args=(services, job.job_id, request, cancel_event),
            name=f"presto-export-workflow-{job.job_id}",
            daemon=True,
        )
        _run_handles_set(
            services,
            job.job_id,
            ThreadedJobHandle(cancel_event=cancel_event, worker=worker, capability=capability_id),
        )
        worker.start()
        return {"jobId": job.job_id, "capability": capability_id, "state": "queued"}

    request = _normalize_export_request(payload, capability_id=capability_id)
    request["capability_id"] = capability_id
    job = JobRecord(
        job_id=f"export-{uuid4().hex[:12]}",
        capability=capability_id,
        target_daw=str(getattr(services, "target_daw", DEFAULT_DAW_TARGET)),
        state="queued",
        progress=JobProgress(phase="queued", current=0, total=1, percent=0.0, message="Export queued."),
        result={
            "outputPath": request["output_path"],
            "fileName": request["file_name"],
            "fileType": request["file_type"],
        },
        created_at=_utc_now(),
    )
    _upsert_job(services, job)

    cancel_event = threading.Event()
    worker = threading.Thread(
        target=_run_export_job,
        args=(services, job.job_id, request, cancel_event),
        name=f"presto-export-run-{job.job_id}",
        daemon=True,
    )
    _run_handles_set(
        services,
        job.job_id,
        ThreadedJobHandle(cancel_event=cancel_event, worker=worker, capability=capability_id),
    )
    worker.start()

    return {"jobId": job.job_id, "capability": capability_id, "state": "queued"}


def start_export_run_payload(
    ctx: CapabilityExecutionContext,
    payload: dict[str, Any],
    *,
    capability_id: str,
) -> dict[str, Any]:
    return start_export_run(runtime_from_context(ctx), payload, capability_id=capability_id)


def start_import_run(services: "ServiceContainer", payload: dict[str, Any]) -> dict[str, Any]:
    _ensure_run_daw_connected(services, payload, capability_id="daw.import.run.start")
    folder_paths = _resolve_import_folder_paths(payload)
    file_paths = _resolve_import_ordered_file_paths(payload, folder_paths)
    import_mode = _resolve_import_mode(payload)
    normalized_folder_paths = [str(folder_path.resolve()) for folder_path in folder_paths]
    job = JobRecord(
        job_id=f"import-{uuid4().hex[:12]}",
        capability="daw.import.run.start",
        target_daw=str(getattr(services, "target_daw", DEFAULT_DAW_TARGET)),
        state="queued",
        progress=JobProgress(phase="queued", current=0, total=max(len(file_paths), 1), percent=0.0, message="Import run queued."),
        result={"folderPaths": normalized_folder_paths, "orderedFilePaths": file_paths, "importMode": import_mode},
        created_at=_utc_now(),
    )
    _upsert_job(services, job)

    cancel_event = threading.Event()
    worker = threading.Thread(
        target=_run_import_job,
        args=(services, job.job_id, file_paths, import_mode, cancel_event),
        name=f"presto-import-run-{job.job_id}",
        daemon=True,
    )
    _run_handles_set(
        services,
        job.job_id,
        ThreadedJobHandle(cancel_event=cancel_event, worker=worker, capability="daw.import.run.start"),
    )
    worker.start()

    return {"jobId": job.job_id, "capability": "daw.import.run.start", "state": "queued"}


def start_import_run_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    return start_import_run(runtime_from_context(ctx), payload)


def cancel_import_run(services: "ServiceContainer", job_id: str) -> None:
    _request_cancel(services, job_id)
    job = _clone_job(services.job_manager.get(job_id))
    if job.state in {"queued", "running", "cancelled"}:
        _set_job_cancelled(services, job, message="Import run cancelled.")


def cancel_job_run(services: "ServiceContainer", job_id: str) -> None:
    _request_cancel(services, job_id)
    job = _clone_job(services.job_manager.get(job_id))
    capability_id = job.capability
    if capability_id in {"daw.export.start", "daw.export.direct.start", "daw.export.run.start"}:
        daw = getattr(services, "daw", None)
        cancel_export = getattr(daw, "cancel_export", None) if daw is not None else None
        if callable(cancel_export):
            try:
                cancel_export()
            except Exception:
                pass
    if capability_id == "daw.import.run.start":
        cancel_import_run(services, job_id)
        return
    if job.state in {"queued", "running", "cancelled"}:
        _set_job_cancelled(services, job, message="Job cancelled.")
