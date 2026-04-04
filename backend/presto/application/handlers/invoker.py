from __future__ import annotations

from typing import Any, Callable

from .automation import (
    execute_strip_silence_payload,
    open_strip_silence_payload,
    split_stereo_to_mono_execute_payload,
)
from .common import ensure_daw_connected, safe_connection_status
from .config import config_payload, update_config_payload
from .import_workflow import analyze_import, persist_import_analysis_cache, plan_import_run_items, start_export_run, start_import_run
from .jobs import (
    cancel_job_payload,
    create_job_payload,
    delete_job_payload,
    get_job_payload,
    list_jobs_payload,
    update_job_payload,
)
from .workflow_executor import start_workflow_run
from .snapshot import (
    apply_snapshot_payload,
    daw_adapter_snapshot_payload,
    get_snapshot_info_payload,
)
from .transport import (
    connect_daw_payload,
    disconnect_daw_payload,
    export_mix_with_source_payload,
    export_range_set_payload,
    map_track_info,
    play_transport_payload,
    record_transport_payload,
    stop_transport_payload,
    transport_status_payload,
)
from ..service_container import ServiceContainer
from ...domain.capabilities import DEFAULT_DAW_TARGET


CapabilityHandler = Callable[[ServiceContainer, dict[str, Any]], Any]


def _system_health_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "system.health"
    ensure_daw_connected(services, capability_id, payload, raise_on_error=False)
    status = safe_connection_status(services)
    return {
        "backendReady": services.backend_ready,
        "dawConnected": bool(getattr(status, "connected", False)),
        "activeDaw": services.target_daw or DEFAULT_DAW_TARGET,
    }


def _daw_connection_get_status_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "daw.connection.getStatus"
    ensure_daw_connected(services, capability_id, payload, raise_on_error=False)
    status = safe_connection_status(services)
    return {
        "connected": bool(getattr(status, "connected", False)),
        "targetDaw": services.target_daw or DEFAULT_DAW_TARGET,
    }


def _session_get_info_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "session.getInfo"
    daw = ensure_daw_connected(services, capability_id, payload, raise_on_error=True)
    info = daw.get_session_info()
    return {
        "session": {
            "sessionName": info.session_name,
            "sessionPath": info.session_path,
            "sampleRate": info.sample_rate,
            "bitDepth": info.bit_depth,
            "isPlaying": bool(info.is_playing),
            "isRecording": bool(info.is_recording),
        }
    }


def _session_get_length_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "session.getLength"
    daw = ensure_daw_connected(services, capability_id, payload, raise_on_error=True)
    seconds = daw.get_session_length()
    return {
        "seconds": float(seconds),
    }


def _session_save_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "session.save"
    daw = ensure_daw_connected(services, capability_id, payload, raise_on_error=True)
    daw.save_session()
    return {
        "saved": True,
    }


def _track_list_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "track.list"
    daw = ensure_daw_connected(services, capability_id, payload, raise_on_error=True)
    tracks = daw.list_tracks()
    return {
        "tracks": [map_track_info(track) for track in tracks],
    }


def _track_list_names_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "track.listNames"
    daw = ensure_daw_connected(services, capability_id, payload, raise_on_error=True)
    names = daw.list_track_names()
    return {
        "names": [str(name) for name in names],
    }


def _track_select_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "track.select"
    daw = ensure_daw_connected(services, capability_id, payload, raise_on_error=True)
    daw.select_track(str(payload.get("trackName", "")))
    return {
        "selected": True,
    }


def _track_selection_get_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "track.selection.get"
    daw = ensure_daw_connected(services, capability_id, payload, raise_on_error=True)
    names = daw.get_selected_track_names()
    return {
        "trackNames": [str(name) for name in names if str(name).strip()],
    }


def _track_color_apply_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "track.color.apply"
    daw = ensure_daw_connected(services, capability_id, payload, raise_on_error=True)
    track_name = str(payload.get("trackName", ""))
    color_slot = payload.get("colorSlot")
    daw.apply_track_color(track_name, color_slot)
    return {
        "applied": True,
        "trackName": track_name,
        "colorSlot": int(color_slot),
    }


def _track_pan_set_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "track.pan.set"
    daw = ensure_daw_connected(services, capability_id, payload, raise_on_error=True)
    track_name = str(payload.get("trackName", ""))
    value = float(payload.get("value", 0.0))
    daw.set_track_pan(track_name, value)
    return {
        "updated": True,
        "trackName": track_name,
        "value": value,
    }


def _track_rename_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "track.rename"
    daw = ensure_daw_connected(services, capability_id, payload, raise_on_error=True)
    current_name = str(payload.get("currentName", ""))
    new_name = str(payload.get("newName", ""))
    daw.rename_track(current_name, new_name)
    return {
        "renamed": True,
        "trackName": new_name,
    }


def _track_mute_set_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "track.mute.set"
    daw = ensure_daw_connected(services, capability_id, payload, raise_on_error=True)
    track_names = [str(name) for name in payload.get("trackNames", []) if str(name).strip()]
    enabled = bool(payload.get("enabled"))
    for track_name in track_names:
        daw.set_track_mute_state(track_name, enabled)
    return {
        "updated": True,
        "trackNames": track_names,
        "enabled": enabled,
    }


def _track_solo_set_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "track.solo.set"
    daw = ensure_daw_connected(services, capability_id, payload, raise_on_error=True)
    track_names = [str(name) for name in payload.get("trackNames", []) if str(name).strip()]
    enabled = bool(payload.get("enabled"))
    for track_name in track_names:
        daw.set_track_solo_state(track_name, enabled)
    return {
        "updated": True,
        "trackNames": track_names,
        "enabled": enabled,
    }


def _track_hidden_set_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "track.hidden.set"
    daw = ensure_daw_connected(services, capability_id, payload, raise_on_error=True)
    track_names = [str(name) for name in payload.get("trackNames", []) if str(name).strip()]
    enabled = bool(payload.get("enabled"))
    for track_name in track_names:
        daw.set_track_hidden_state(track_name, enabled)
    return {
        "updated": True,
        "trackNames": track_names,
        "enabled": enabled,
    }


def _track_inactive_set_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "track.inactive.set"
    daw = ensure_daw_connected(services, capability_id, payload, raise_on_error=True)
    track_names = [str(name) for name in payload.get("trackNames", []) if str(name).strip()]
    enabled = bool(payload.get("enabled"))
    for track_name in track_names:
        daw.set_track_inactive_state(track_name, enabled)
    return {
        "updated": True,
        "trackNames": track_names,
        "enabled": enabled,
    }


def _clip_select_all_on_track_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    capability_id = "clip.selectAllOnTrack"
    daw = ensure_daw_connected(services, capability_id, payload, raise_on_error=True)
    track_name = str(payload.get("trackName", ""))
    daw.select_all_clips_on_track(track_name)
    return {
        "selected": True,
    }


def _start_export_payload(capability_id: str) -> CapabilityHandler:
    def _handler(services: ServiceContainer, payload: dict[str, Any]) -> Any:
        return start_export_run(services, payload, capability_id=capability_id)

    return _handler


def _config_get_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    del payload
    return config_payload(services)


def _daw_connection_disconnect_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    del payload
    return disconnect_daw_payload(services)


def _session_get_snapshot_info_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    del services
    return get_snapshot_info_payload(payload)


def _strip_silence_open_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    del payload
    return open_strip_silence_payload(services)


def _import_analyze_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    return analyze_import(services, payload)


def _import_cache_save_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    return persist_import_analysis_cache(services, payload)


def _import_plan_run_items_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    return plan_import_run_items(services, payload)


def _execute_atomic_capability(services: ServiceContainer, capability_id: str, payload: dict[str, Any]) -> Any:
    handler = _CAPABILITY_HANDLERS.get(capability_id)
    if handler is None or capability_id == "workflow.run.start":
        raise NotImplementedError(f"Capability not implemented: {capability_id}")
    return handler(services, payload)


def _workflow_run_start_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    return start_workflow_run(
        services,
        payload,
        invoke_capability=lambda capability_id, request_payload: _execute_atomic_capability(
            services,
            capability_id,
            request_payload,
        ),
    )


_CAPABILITY_HANDLERS: dict[str, CapabilityHandler] = {
    "system.health": _system_health_payload,
    "daw.connection.getStatus": _daw_connection_get_status_payload,
    "daw.adapter.getSnapshot": daw_adapter_snapshot_payload,
    "automation.splitStereoToMono.execute": split_stereo_to_mono_execute_payload,
    "config.get": _config_get_payload,
    "config.update": update_config_payload,
    "daw.connection.connect": connect_daw_payload,
    "daw.connection.disconnect": _daw_connection_disconnect_payload,
    "session.getInfo": _session_get_info_payload,
    "session.getLength": _session_get_length_payload,
    "session.save": _session_save_payload,
    "import.analyze": _import_analyze_payload,
    "import.cache.save": _import_cache_save_payload,
    "import.run.start": start_import_run,
    "session.applySnapshot": apply_snapshot_payload,
    "session.getSnapshotInfo": _session_get_snapshot_info_payload,
    "track.list": _track_list_payload,
    "track.listNames": _track_list_names_payload,
    "track.select": _track_select_payload,
    "track.selection.get": _track_selection_get_payload,
    "track.color.apply": _track_color_apply_payload,
    "track.pan.set": _track_pan_set_payload,
    "track.rename": _track_rename_payload,
    "track.mute.set": _track_mute_set_payload,
    "track.solo.set": _track_solo_set_payload,
    "track.hidden.set": _track_hidden_set_payload,
    "track.inactive.set": _track_inactive_set_payload,
    "clip.selectAllOnTrack": _clip_select_all_on_track_payload,
    "export.range.set": export_range_set_payload,
    "export.start": _start_export_payload("export.start"),
    "export.direct.start": _start_export_payload("export.direct.start"),
    "export.run.start": _start_export_payload("export.run.start"),
    "export.mixWithSource": export_mix_with_source_payload,
    "transport.play": play_transport_payload,
    "transport.stop": stop_transport_payload,
    "transport.record": record_transport_payload,
    "transport.getStatus": transport_status_payload,
    "workflow.run.start": _workflow_run_start_payload,
    "import.planRunItems": _import_plan_run_items_payload,
    "stripSilence.open": _strip_silence_open_payload,
    "stripSilence.execute": execute_strip_silence_payload,
    "jobs.get": get_job_payload,
    "jobs.list": list_jobs_payload,
    "jobs.create": create_job_payload,
    "jobs.update": update_job_payload,
    "jobs.cancel": cancel_job_payload,
    "jobs.delete": delete_job_payload,
    "stripSilence.openViaUi": _strip_silence_open_payload,
    "stripSilence.executeViaUi": execute_strip_silence_payload,
}


def execute_capability(services: ServiceContainer, capability_id: str, payload: dict[str, Any]) -> Any:
    services.capability_registry.require(capability_id)

    handler = _CAPABILITY_HANDLERS.get(capability_id)
    if handler is None:
        raise NotImplementedError(f"Capability not implemented: {capability_id}")

    return handler(services, payload)
