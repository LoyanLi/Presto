from __future__ import annotations

from typing import Any, Callable

from ...domain.ports import CapabilityExecutionContext
from ...integrations.daw.ptsl_semantic import list_semantic_capability_definitions
from . import track as track_handlers
from .automation import (
    execute_strip_silence_payload,
    execute_strip_silence_via_ui_payload,
    open_strip_silence_payload,
    open_strip_silence_via_ui_payload,
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
from .ptsl import (
    build_daw_ptsl_semantic_execute_payload,
    daw_ptsl_catalog_list_payload,
    daw_ptsl_command_describe_payload,
    daw_ptsl_command_execute_payload,
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
    "daw.ptsl.catalog.list": daw_ptsl_catalog_list_payload,
    "daw.ptsl.command.describe": daw_ptsl_command_describe_payload,
    "daw.ptsl.command.execute": daw_ptsl_command_execute_payload,
    "daw.automation.splitStereoToMono.execute": split_stereo_to_mono_execute_payload,
    "config.get": config_payload,
    "config.update": update_config_payload,
    "daw.connection.connect": connect_daw_payload,
    "daw.connection.disconnect": disconnect_daw_payload,
    "daw.session.getInfo": session_get_info_payload,
    "daw.session.getLength": session_get_length_payload,
    "daw.session.save": session_save_payload,
    "daw.import.analyze": analyze_import_payload,
    "daw.import.cache.save": persist_import_analysis_cache_payload,
    "daw.import.run.start": start_import_run_payload,
    "daw.session.applySnapshot": apply_snapshot_payload,
    "daw.session.getSnapshotInfo": session_get_snapshot_info_payload,
    "daw.track.list": track_handlers.track_list_payload,
    "daw.track.listNames": track_handlers.track_list_names_payload,
    "daw.track.select": track_handlers.track_select_payload,
    "daw.track.selection.get": track_handlers.track_selection_get_payload,
    "daw.track.color.apply": track_handlers.track_color_apply_payload,
    "daw.track.pan.set": track_handlers.track_pan_set_payload,
    "daw.track.rename": track_handlers.track_rename_payload,
    "daw.track.mute.set": track_handlers.track_mute_set_payload,
    "daw.track.solo.set": track_handlers.track_solo_set_payload,
    "daw.track.hidden.set": track_handlers.track_hidden_set_payload,
    "daw.track.inactive.set": track_handlers.track_inactive_set_payload,
    "daw.track.recordEnable.set": track_handlers.track_record_enable_set_payload,
    "daw.track.recordSafe.set": track_handlers.track_record_safe_set_payload,
    "daw.track.inputMonitor.set": track_handlers.track_input_monitor_set_payload,
    "daw.track.online.set": track_handlers.track_online_set_payload,
    "daw.track.frozen.set": track_handlers.track_frozen_set_payload,
    "daw.track.open.set": track_handlers.track_open_set_payload,
    "daw.clip.selectAllOnTrack": clip_select_all_on_track_payload,
    "daw.export.range.set": export_range_set_payload,
    "daw.export.start": _start_export_handler("daw.export.start"),
    "daw.export.direct.start": _start_export_handler("daw.export.direct.start"),
    "daw.export.run.start": _start_export_handler("daw.export.run.start"),
    "daw.export.mixWithSource": export_mix_with_source_payload,
    "daw.transport.play": play_transport_payload,
    "daw.transport.stop": stop_transport_payload,
    "daw.transport.record": record_transport_payload,
    "daw.transport.getStatus": transport_status_payload,
    "workflow.run.start": start_workflow_run_payload,
    "daw.import.planRunItems": plan_import_run_items_payload,
    "daw.stripSilence.open": open_strip_silence_payload,
    "daw.stripSilence.execute": execute_strip_silence_payload,
    "jobs.get": get_job_payload,
    "jobs.list": list_jobs_payload,
    "jobs.create": create_job_payload,
    "jobs.update": update_job_payload,
    "jobs.cancel": cancel_job_payload,
    "jobs.delete": delete_job_payload,
    "daw.stripSilence.openViaUi": open_strip_silence_via_ui_payload,
    "daw.stripSilence.executeViaUi": execute_strip_silence_via_ui_payload,
}

for definition in list_semantic_capability_definitions():
    implementation = definition["implementations"]["pro_tools"]
    HANDLER_BINDINGS[str(definition["handler"])] = build_daw_ptsl_semantic_execute_payload(
        str(definition["id"]),
        str(implementation["command"]),
    )
