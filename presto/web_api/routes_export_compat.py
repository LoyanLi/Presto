"""Track2Do-compatible export API routes (/api/v1/*)."""

from __future__ import annotations

from datetime import datetime
import json
from threading import Thread
import uuid

from fastapi import APIRouter, HTTPException, Request

from presto.domain.errors import PrestoError
from presto.domain.export_models import (
    ExportCancelToken,
    ExportSettings,
    ExportSnapshot,
    ExportTrackState,
)
from presto.web_api.routes_common import get_services
from presto.web_api.schemas import (
    ApplySnapshotRequest,
    BaseResponse,
    ExportRequestPayload,
    SessionInfoResponse,
    TrackListResponse,
    TrackStateResponse,
)
from presto.web_api.task_registry import TaskRecord


router = APIRouter()


@router.get("/connection/status")
def connection_status(request: Request):
    services = get_services(request)
    connected = False
    try:
        services.gateway.connect()
        services.gateway.ensure_session_open()
        connected = True
    except Exception:
        connected = False
    return {"connected": connected, "host": "127.0.0.1", "port": 31416, "last_connected": datetime.now() if connected else None}


@router.get("/session/info", response_model=SessionInfoResponse)
def session_info(request: Request):
    services = get_services(request)
    try:
        services.gateway.connect()
        services.gateway.ensure_session_open()
        session = services.gateway.get_session_info()
        return SessionInfoResponse(
            session_name=session.session_name,
            session_path=session.session_path,
            sample_rate=session.sample_rate,
            bit_depth=session.bit_depth,
            is_playing=False,
            is_recording=False,
            transport_state="stopped",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/tracks", response_model=TrackListResponse)
def tracks(request: Request):
    services = get_services(request)
    try:
        services.gateway.connect()
        data = services.gateway.list_tracks()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    rows = [
        TrackStateResponse(
            id=track.track_id,
            name=track.track_name,
            type=track.track_type,
            is_muted=track.is_muted,
            is_soloed=track.is_soloed,
            color=track.color,
        )
        for track in data
    ]
    return TrackListResponse(success=True, message="ok", tracks=rows, total_count=len(rows))


@router.post("/session/apply-snapshot", response_model=BaseResponse)
def apply_snapshot(payload: ApplySnapshotRequest, request: Request):
    services = get_services(request)
    snapshot = ExportSnapshot(
        id=payload.snapshot.id,
        name=payload.snapshot.name,
        track_states=[
            ExportTrackState(
                track_id=track.trackId,
                track_name=track.trackName,
                is_soloed=track.is_soloed,
                is_muted=track.is_muted,
                track_type=track.type,
                color=track.color,
            )
            for track in payload.snapshot.trackStates
        ],
        created_at=payload.snapshot.createdAt,
        updated_at=payload.snapshot.updatedAt,
    )
    try:
        report = services.export_orchestrator.apply_snapshot(snapshot)
        if report.error_count > 0:
            return BaseResponse(
                success=True,
                message=f"Snapshot applied with warnings. success={report.success_count} errors={report.error_count}",
            )
        return BaseResponse(success=True, message=f"Snapshot '{snapshot.name}' applied.")
    except PrestoError as exc:
        raise HTTPException(status_code=500, detail={"error_code": exc.code, "message": exc.message})
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/session/snapshot-info")
def snapshot_info(snapshot_data: str):
    try:
        raw = json.loads(snapshot_data)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid snapshot_data: {exc}")
    track_states = raw.get("trackStates", [])
    return {
        "success": True,
        "message": "ok",
        "snapshot": raw,
        "statistics": {
            "total_tracks": len(track_states),
            "muted_tracks": len([item for item in track_states if item.get("is_muted")]),
            "soloed_tracks": len([item for item in track_states if item.get("is_soloed")]),
            "normal_tracks": len([item for item in track_states if not item.get("is_muted") and not item.get("is_soloed")]),
        },
    }


def _task_to_export_status(task: TaskRecord) -> dict:
    return {
        "task_id": task.task_id,
        "status": task.status,
        "progress": task.progress,
        "current_snapshot": task.current_index,
        "total_snapshots": task.total,
        "current_snapshot_name": task.current_name,
        "created_at": task.created_at.isoformat(),
        "started_at": task.started_at.isoformat() if task.started_at else None,
        "completed_at": task.finished_at.isoformat() if task.finished_at else None,
        "result": task.result,
    }


@router.post("/export/start")
def export_start(payload: ExportRequestPayload, request: Request):
    services = get_services(request)
    if not payload.snapshots:
        raise HTTPException(status_code=400, detail="No snapshots selected.")
    task_id = f"export_{uuid.uuid4().hex[:8]}_{int(datetime.now().timestamp())}"
    cancel_token = ExportCancelToken()
    services.task_registry.create(
        TaskRecord(
            task_id=task_id,
            task_type="export",
            status="pending",
            progress=0.0,
            current_index=0,
            total=len(payload.snapshots),
            current_name="",
            created_at=datetime.now(),
            cancel_token=cancel_token,
        )
    )

    snapshots = [
        ExportSnapshot(
            id=item.id,
            name=item.name,
            track_states=[
                ExportTrackState(
                    track_id=track.trackId,
                    track_name=track.trackName,
                    is_soloed=track.is_soloed,
                    is_muted=track.is_muted,
                    track_type=track.type,
                    color=track.color,
                )
                for track in item.trackStates
            ],
            created_at=item.createdAt,
            updated_at=item.updatedAt,
        )
        for item in payload.snapshots
    ]
    settings = ExportSettings(
        file_format=payload.export_settings.file_format.lower(),  # type: ignore[arg-type]
        mix_source_name=payload.export_settings.mix_source_name,
        mix_source_type=payload.export_settings.mix_source_type,  # type: ignore[arg-type]
        online_export=payload.export_settings.online_export,
        file_prefix=payload.export_settings.file_prefix,
        output_path=payload.export_settings.output_path,
    )

    def _run() -> None:
        services.task_registry.update(task_id, status="running", started_at=datetime.now())
        try:
            report = services.export_orchestrator.run_batch(
                snapshots=snapshots,
                settings=settings,
                start_time=payload.start_time,
                end_time=payload.end_time,
                on_progress=lambda progress: services.task_registry.update(
                    task_id,
                    status=progress.status,
                    progress=progress.progress_percent,
                    current_index=progress.current_index,
                    total=progress.total,
                    current_name=progress.current_snapshot_name,
                ),
                cancel_token=cancel_token,
            )
            services.task_registry.update(
                task_id,
                status=report.status,
                progress=100.0 if report.status in {"completed", "completed_with_errors"} else 0.0,
                current_index=len(report.results),
                total=len(snapshots),
                current_name=(report.results[-1].snapshot_name if report.results else ""),
                result={
                    "success": report.status == "completed",
                    "exported_files": report.exported_files,
                    "failed_snapshots": report.failed_snapshots,
                    "total_duration": report.total_duration_sec,
                    "error_message": report.error_message,
                },
                finished_at=datetime.now(),
            )
        except Exception as exc:
            services.task_registry.update(
                task_id,
                status="failed",
                error_code=getattr(exc, "code", "UNEXPECTED_ERROR"),
                error_message=getattr(exc, "message", str(exc)),
                finished_at=datetime.now(),
            )

    Thread(target=_run, daemon=True).start()
    return {"success": True, "message": f"Export task started: {task_id}", "task_id": task_id}


@router.get("/export/status/{task_id}")
def export_status(task_id: str, request: Request):
    services = get_services(request)
    task = services.task_registry.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    return {"success": True, "message": "ok", "data": _task_to_export_status(task)}


@router.get("/export/tasks")
def export_tasks(request: Request):
    services = get_services(request)
    tasks = services.task_registry.list_by_type("export")
    return {
        "success": True,
        "message": "ok",
        "data": {
            "tasks": [_task_to_export_status(task) for task in tasks],
            "total_count": len(tasks),
        },
    }


@router.post("/export/stop/{task_id}", response_model=BaseResponse)
def export_stop(task_id: str, request: Request):
    services = get_services(request)
    task = services.task_registry.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found.")
    if task.cancel_token is not None:
        services.export_orchestrator.request_cancel(task.cancel_token)
    services.task_registry.update(task_id, status="cancelled")
    return BaseResponse(success=True, message="Export stop requested.")


@router.delete("/export/tasks/{task_id}", response_model=BaseResponse)
def export_delete(task_id: str, request: Request):
    services = get_services(request)
    if not services.task_registry.delete(task_id):
        raise HTTPException(status_code=404, detail="Task not found.")
    return BaseResponse(success=True, message="Task deleted.")

