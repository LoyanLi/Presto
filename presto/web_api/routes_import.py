"""Import workflow API routes for web UI."""

from __future__ import annotations

from datetime import datetime
from threading import Thread
import uuid

from fastapi import APIRouter, HTTPException, Request

from presto.domain.errors import PrestoError
from presto.domain.models import ImportItem, RenameProposal, ResolvedImportItem
from presto.web_api.dependencies import get_services
from presto.web_api.schemas import (
    BaseResponse,
    ImportAnalyzeRequest,
    ImportFinalizeRequest,
    ImportRunRequest,
)
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
        raise HTTPException(status_code=400, detail="No items to import.")
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
        )
    )

    def _run() -> None:
        services.task_registry.update(task_id, status="running", started_at=datetime.now())

        def _update_progress(current_index: int, total: int, current_name: str) -> None:
            safe_total = max(total, 1)
            progress = min(100.0, max(0.0, (current_index / safe_total) * 100.0))
            services.task_registry.update(
                task_id,
                status="running",
                progress=progress,
                current_index=current_index,
                total=total,
                current_name=current_name or "",
            )

        try:
            report = services.import_orchestrator.run_resolved(
                resolved_items,
                category_map,
                cfg.silence_profile,
                progress_callback=_update_progress,
            )
            services.task_registry.update(
                task_id,
                status="completed" if report.failed_count == 0 else "completed_with_errors",
                progress=100.0,
                current_index=report.total,
                total=report.total,
                current_name="",
                result={
                    "total": report.total,
                    "success_count": report.success_count,
                    "failed_count": report.failed_count,
                    "results": [result.__dict__ for result in report.results],
                },
                finished_at=datetime.now(),
            )
        except Exception as exc:
            services.task_registry.update(
                task_id,
                status="failed",
                current_name="",
                error_code=getattr(exc, "code", "UNEXPECTED_ERROR"),
                error_message=getattr(exc, "message", str(exc)),
                finished_at=datetime.now(),
            )

    Thread(target=_run, daemon=True).start()
    return {"success": True, "message": "Import task started.", "run_id": task_id}


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
            "created_at": task.created_at.isoformat(),
            "started_at": task.started_at.isoformat() if task.started_at else None,
            "finished_at": task.finished_at.isoformat() if task.finished_at else None,
            "result": task.result,
            "error_code": task.error_code,
            "error_message": task.error_message,
        },
    }
