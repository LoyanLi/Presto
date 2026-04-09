from __future__ import annotations

from typing import Any, Callable

from ...domain.ports import CapabilityExecutionContext
from . import track as track_handlers
from .automation import (
    execute_strip_silence_payload,
    open_strip_silence_payload,
    split_stereo_to_mono_execute_payload,
)
from .clip import clip_select_all_on_track_payload
from .config import config_payload, update_config_payload
from .import_workflow import (
    analyze_import_payload,
    persist_import_analysis_cache_payload,
    plan_import_run_items_payload,
    start_export_run_payload,
    start_import_run_payload,
)
from .jobs import (
    cancel_job_payload,
    create_job_payload,
    delete_job_payload,
    get_job_payload,
    list_jobs_payload,
    update_job_payload,
)
from .session import (
    session_get_info_payload,
    session_get_length_payload,
    session_get_snapshot_info_payload,
    session_save_payload,
)
from .snapshot import apply_snapshot_payload, daw_adapter_snapshot_payload
from .system import daw_connection_get_status_payload, system_health_payload
from .transport import (
    connect_daw_payload,
    disconnect_daw_payload,
    export_mix_with_source_payload,
    export_range_set_payload,
    play_transport_payload,
    record_transport_payload,
    stop_transport_payload,
    transport_status_payload,
)
from .workflow_executor import start_workflow_run_payload


CapabilityHandler = Callable[[CapabilityExecutionContext, dict[str, Any]], Any]


def _start_export_handler(capability_id: str) -> CapabilityHandler:
    def _handler(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
        return start_export_run_payload(ctx, payload, capability_id=capability_id)

    return _handler


HANDLER_BINDINGS: dict[str, CapabilityHandler] = {
    "system.health": system_health_payload,
    "daw.connection.getStatus": daw_connection_get_status_payload,
    "daw.adapter.getSnapshot": daw_adapter_snapshot_payload,
    "automation.splitStereoToMono.execute": split_stereo_to_mono_execute_payload,
    "config.get": config_payload,
    "config.update": update_config_payload,
    "daw.connection.connect": connect_daw_payload,
    "daw.connection.disconnect": disconnect_daw_payload,
    "session.getInfo": session_get_info_payload,
    "session.getLength": session_get_length_payload,
    "session.save": session_save_payload,
    "import.analyze": analyze_import_payload,
    "import.cache.save": persist_import_analysis_cache_payload,
    "import.run.start": start_import_run_payload,
    "session.applySnapshot": apply_snapshot_payload,
    "session.getSnapshotInfo": session_get_snapshot_info_payload,
    "track.list": track_handlers.track_list_payload,
    "track.listNames": track_handlers.track_list_names_payload,
    "track.select": track_handlers.track_select_payload,
    "track.selection.get": track_handlers.track_selection_get_payload,
    "track.color.apply": track_handlers.track_color_apply_payload,
    "track.pan.set": track_handlers.track_pan_set_payload,
    "track.rename": track_handlers.track_rename_payload,
    "track.mute.set": track_handlers.track_mute_set_payload,
    "track.solo.set": track_handlers.track_solo_set_payload,
    "track.hidden.set": track_handlers.track_hidden_set_payload,
    "track.inactive.set": track_handlers.track_inactive_set_payload,
    "track.recordEnable.set": track_handlers.track_record_enable_set_payload,
    "track.recordSafe.set": track_handlers.track_record_safe_set_payload,
    "track.inputMonitor.set": track_handlers.track_input_monitor_set_payload,
    "track.online.set": track_handlers.track_online_set_payload,
    "track.frozen.set": track_handlers.track_frozen_set_payload,
    "track.open.set": track_handlers.track_open_set_payload,
    "clip.selectAllOnTrack": clip_select_all_on_track_payload,
    "export.range.set": export_range_set_payload,
    "export.start": _start_export_handler("export.start"),
    "export.direct.start": _start_export_handler("export.direct.start"),
    "export.run.start": _start_export_handler("export.run.start"),
    "export.mixWithSource": export_mix_with_source_payload,
    "transport.play": play_transport_payload,
    "transport.stop": stop_transport_payload,
    "transport.record": record_transport_payload,
    "transport.getStatus": transport_status_payload,
    "workflow.run.start": start_workflow_run_payload,
    "import.planRunItems": plan_import_run_items_payload,
    "stripSilence.open": open_strip_silence_payload,
    "stripSilence.execute": execute_strip_silence_payload,
    "jobs.get": get_job_payload,
    "jobs.list": list_jobs_payload,
    "jobs.create": create_job_payload,
    "jobs.update": update_job_payload,
    "jobs.cancel": cancel_job_payload,
    "jobs.delete": delete_job_payload,
    "stripSilence.openViaUi": open_strip_silence_payload,
    "stripSilence.executeViaUi": execute_strip_silence_payload,
}
