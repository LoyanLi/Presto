"""Import workflow API routes for web UI."""

from __future__ import annotations

from datetime import datetime
from threading import Thread
import uuid

from fastapi import APIRouter, HTTPException, Request

from presto.domain.errors import PrestoError
from presto.domain.export_models import ExportCancelToken
from presto.domain.models import ImportItem, RenameProposal, ResolvedImportItem
from presto.web_api.dependencies import get_services
from presto.web_api.schemas import (
    BaseResponse,
    ImportAnalyzeRequest,
    ImportFinalizeRequest,
    ImportRunRequest,
)
from presto.web_api.progress_metrics import estimate_eta_seconds
from presto.web_api.task_registry import TaskRecord


router = APIRouter()


@router.post("/import/preflight", response_model=BaseResponse)
def import_preflight(request: Request):
    services = get_services(request)
    try:
        session_path = services.import_orchestrator.preflight()
    except PrestoError as exc:
        raise HTTPException(status_code=500, detail={"error_code": exc.code, "message": exc.message})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return BaseResponse(success=True, message=f"Preflight ready: {session_path}")


@router.post("/import/ai-analyze")
def import_ai_analyze(payload: ImportAnalyzeRequest, request: Request):
    services = get_services(request)
    cfg = services.config_store.load()
    items = [ImportItem(file_path=item.file_path, category_id=item.category_id) for item in payload.items]
    category_map = {category.id: (category.name, category.pt_color_slot) for category in cfg.categories}
    existing = set()
    try:
        services.gateway.connect()
        existing = set(services.gateway.list_track_names())
    except Exception:
        existing = set()

    try:
        proposals = services.ai_rename_service.generate_proposals(
            items=items,
            category_map=category_map,
            existing_track_names=existing,
            config=cfg.ai_naming,
        )
    except PrestoError as exc:
        raise HTTPException(status_code=500, detail={"error_code": exc.code, "message": exc.message})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {
        "success": True,
        "message": "ok",
        "proposals": [proposal.__dict__ for proposal in proposals],
    }


@router.post("/import/finalize")
def import_finalize(payload: ImportFinalizeRequest, request: Request):
    services = get_services(request)
    proposals = [
        RenameProposal(
            file_path=item.file_path,
            category_id=item.category_id,
            original_stem=item.original_stem,
            ai_name=item.ai_name,
            final_name=item.final_name,
            status=item.status,  # type: ignore[arg-type]
            error_message=item.error_message,
        )
        for item in payload.proposals
    ]
    existing = set()
    try:
        services.gateway.connect()
        existing = set(services.gateway.list_track_names())
    except Exception:
        existing = set()

    try:
        updated, resolved = services.ai_rename_service.finalize_for_import(
            proposals=proposals,
            manual_name_by_path=payload.manual_name_by_path,
            existing_track_names=existing,
        )
    except PrestoError as exc:
        raise HTTPException(status_code=500, detail={"error_code": exc.code, "message": exc.message})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {
        "success": True,
        "message": "ok",
        "proposals": [item.__dict__ for item in updated],
        "resolved_items": [item.__dict__ for item in resolved],
    }


@router.post("/import/strip/open", response_model=BaseResponse)
def import_strip_open(request: Request):
    services = get_services(request)
    try:
        services.import_orchestrator.preflight()
        services.import_orchestrator.prepare_strip_silence()
    except PrestoError as exc:
        raise HTTPException(status_code=500, detail={"error_code": exc.code, "message": exc.message})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return BaseResponse(success=True, message="Strip Silence window opened.")


@router.post("/import/run/start")
def import_run_start(payload: ImportRunRequest, request: Request):
    services = get_services(request)
    if not payload.items:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "NO_ITEMS", "message": "No items to import."},
        )
    cfg = services.config_store.load()
    category_map = {category.id: (category.name, category.pt_color_slot) for category in cfg.categories}
    resolved_items = [
        ResolvedImportItem(
            file_path=item.file_path,
            category_id=item.category_id,
            target_track_name=item.target_track_name,
        )
        for item in payload.items
    ]
    task_id = f"import_{uuid.uuid4().hex[:8]}_{int(datetime.now().timestamp())}"
    services.task_registry.create(
        TaskRecord(
            task_id=task_id,
            task_type="import",
            status="pending",
            progress=0.0,
            current_index=0,
            total=len(resolved_items),
            current_name="",
            created_at=datetime.now(),
            stage="stage_import_rename",
            stage_current=0,
            stage_total=len(resolved_items),
            stage_progress=0.0,
            cancel_token=ExportCancelToken(),
        )
    )

    def _run() -> None:
        started_at = datetime.now()
        services.task_registry.update(task_id, status="running", started_at=started_at)

        def _update_progress(current_index: int, total: int, current_name: str) -> None:
            task = services.task_registry.get(task_id)
            if task is None or task.status == "cancelled":
                return
            safe_total = max(total, 1)
            progress = min(100.0, max(0.0, (current_index / safe_total) * 100.0))
            elapsed_seconds = (datetime.now() - started_at).total_seconds()
            eta_seconds = estimate_eta_seconds(elapsed_seconds=elapsed_seconds, progress=progress)
            services.task_registry.update(
                task_id,
                status="running",
                progress=progress,
                eta_seconds=eta_seconds,
                current_index=current_index,
                total=total,
                current_name=current_name or "",
            )

        def _update_stage_progress(
            stage_name: str,
            stage_current: int,
            stage_total: int,
            _overall_current: int,
            _overall_total: int,
            current_name: str,
        ) -> None:
            task = services.task_registry.get(task_id)
            if task is None or task.status == "cancelled":
                return
            safe_total = max(stage_total, 1)
            stage_progress = min(100.0, max(0.0, (stage_current / safe_total) * 100.0))
            services.task_registry.update(
                task_id,
                status="running",
                stage=stage_name,
                stage_current=stage_current,
                stage_total=stage_total,
                stage_progress=stage_progress,
                current_name=current_name or "",
            )

        try:
            task_snapshot = services.task_registry.get(task_id)
            cancel_token = task_snapshot.cancel_token if task_snapshot is not None else None
            report = services.import_orchestrator.run_resolved(
                resolved_items,
                category_map,
                cfg.silence_profile,
                progress_callback=_update_progress,
                stage_progress_callback=_update_stage_progress,
                cancel_token=cancel_token,
            )
            task_after_run = services.task_registry.get(task_id)
            if task_after_run is not None and task_after_run.status == "cancelled":
                services.task_registry.update(
                    task_id,
                    finished_at=datetime.now(),
                    eta_seconds=0,
                )
                return
            services.task_registry.update(
                task_id,
                status="completed" if report.failed_count == 0 else "completed_with_errors",
                progress=100.0,
                current_index=report.total,
                total=report.total,
                current_name="",
                stage="stage_completed",
                stage_current=1,
                stage_total=1,
                stage_progress=100.0,
                eta_seconds=0,
                result={
                    "total": report.total,
                    "success_count": report.success_count,
                    "failed_count": report.failed_count,
                    "results": [result.__dict__ for result in report.results],
                },
                finished_at=datetime.now(),
            )
        except PrestoError as exc:
            if getattr(exc, "code", "") == "IMPORT_CANCELLED":
                services.task_registry.update(
                    task_id,
                    status="cancelled",
                    current_name="",
                    stage_progress=100.0,
                    eta_seconds=0,
                    finished_at=datetime.now(),
                )
                return
            services.task_registry.update(
                task_id,
                status="failed",
                current_name="",
                error_code=getattr(exc, "code", "UNEXPECTED_ERROR"),
                error_message=getattr(exc, "message", str(exc)),
                stage_progress=100.0,
                eta_seconds=0,
                finished_at=datetime.now(),
            )
        except Exception as exc:
            services.task_registry.update(
                task_id,
                status="failed",
                current_name="",
                error_code=getattr(exc, "code", "UNEXPECTED_ERROR"),
                error_message=getattr(exc, "message", str(exc)),
                stage_progress=100.0,
                eta_seconds=0,
                finished_at=datetime.now(),
            )

    Thread(target=_run, daemon=True).start()
    return {"success": True, "message": "Import task started.", "run_id": task_id}


@router.post("/import/run/stop/{run_id}")
def import_run_stop(run_id: str, request: Request):
    services = get_services(request)
    task = services.task_registry.get(run_id)
    if task is None or task.task_type != "import":
        raise HTTPException(
            status_code=404,
            detail={"error_code": "IMPORT_TASK_NOT_FOUND", "message": "Import task not found."},
        )
    if task.status not in {"pending", "running"}:
        raise HTTPException(
            status_code=400,
            detail={"error_code": "IMPORT_TASK_NOT_RUNNING", "message": "Import task is not running."},
        )

    if task.cancel_token is not None:
        task.cancel_token.cancel()

    services.task_registry.update(
        run_id,
        status="cancelled",
        eta_seconds=0,
        finished_at=datetime.now(),
    )
    return {"success": True, "message": "Import task cancellation requested."}


@router.get("/import/run/{run_id}")
def import_run_status(run_id: str, request: Request):
    services = get_services(request)
    task = services.task_registry.get(run_id)
    if task is None or task.task_type != "import":
        raise HTTPException(status_code=404, detail="Import task not found.")
    return {
        "success": True,
        "message": "ok",
        "data": {
            "run_id": task.task_id,
            "status": task.status,
            "progress": task.progress,
            "current_index": task.current_index,
            "total": task.total,
            "current_name": task.current_name,
            "stage": task.stage,
            "stage_current": task.stage_current,
            "stage_total": task.stage_total,
            "stage_progress": task.stage_progress,
            "eta_seconds": task.eta_seconds,
            "created_at": task.created_at.isoformat(),
            "started_at": task.started_at.isoformat() if task.started_at else None,
            "finished_at": task.finished_at.isoformat() if task.finished_at else None,
            "result": task.result,
            "error_code": task.error_code,
            "error_message": task.error_message,
        },
    }
