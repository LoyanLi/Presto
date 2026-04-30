from __future__ import annotations

import subprocess
import threading
import time
from pathlib import Path
import pytest

from presto.integrations.daw import protools_adapter as protools_adapter_module
from presto.domain.errors import PrestoError
from presto.integrations.daw.ptsl_catalog import list_commands
from presto.integrations.daw.protools_adapter import ProToolsDawAdapter, _convert_posix_directory_to_hfs


TEST_PTSL_HOST_VERSION = "2025.10.0"


def _adapter() -> ProToolsDawAdapter:
    return ProToolsDawAdapter(address="127.0.0.1:31416")


def _pt_constant(name: str) -> int:
    value = getattr(protools_adapter_module.pt, name, None)
    if not isinstance(value, int):
        raise AssertionError(f"missing ptsl constant {name}")
    return value


def _track_record(
    name: str,
    *,
    index: int,
    track_format: str = "TF_Stereo",
    is_selected: str | int = "TAState_None",
    is_muted: bool = False,
    is_soloed: bool = False,
) -> dict[str, object]:
    return {
        "id": str(index),
        "name": name,
        "type": "TT_Audio",
        "format": track_format,
        "track_attributes": {
            "is_selected": is_selected,
            "is_muted": is_muted,
            "is_soloed": is_soloed,
        },
    }


def _track_list_response(
    track_names: list[str],
    *,
    selected_track_names: set[str] | None = None,
    track_formats: dict[str, str] | None = None,
) -> dict[str, object]:
    selected = selected_track_names or set()
    formats = track_formats or {}
    track_list = [
        _track_record(
            name,
            index=index,
            track_format=formats.get(name, "TF_Stereo"),
            is_selected="TAState_SetExplicitly" if name in selected else "TAState_None",
        )
        for index, name in enumerate(track_names, start=1)
    ]
    return {
        "track_list": track_list,
        "pagination_response": {
            "limit": max(len(track_list), 1),
            "offset": 0,
            "total": len(track_list),
        },
    }


def test_coerce_session_length_seconds_uses_session_timecode_rate() -> None:
    adapter = _adapter()

    seconds = adapter._coerce_session_length_seconds("00:00:10:15", 5)

    assert seconds == 10.5


def test_coerce_session_length_seconds_handles_drop_frame_rate() -> None:
    adapter = _adapter()

    seconds = adapter._coerce_session_length_seconds("00:01:00:02", 4)

    assert round(seconds, 3) == 60.06


def test_detect_host_version_ignores_non_pro_tools_version_attr() -> None:
    adapter = _adapter()

    class EngineWithLibraryVersion:
        version = "123"
        ptsl_version = "2025.10.0"

    assert adapter._detect_host_version(EngineWithLibraryVersion()) == "2025.10.0"


def test_detect_host_version_reads_ptsl_version_response(monkeypatch: pytest.MonkeyPatch) -> None:
    adapter = _adapter()

    class FakeGetVersionOp:
        response = None

    class FakePtslOps:
        @staticmethod
        def CId_GetPTSLVersion() -> FakeGetVersionOp:
            return FakeGetVersionOp()

    class FakeVersionResponse:
        version = 2025
        version_minor = 10
        version_revision = 2

    class FakeClient:
        def run(self, op: FakeGetVersionOp) -> None:
            op.response = FakeVersionResponse()

    class EngineWithResponseVersion:
        client = FakeClient()

        def ptsl_version(self) -> int:
            return 2025

    monkeypatch.setattr(protools_adapter_module, "ptsl_ops", FakePtslOps)

    assert adapter._detect_host_version(EngineWithResponseVersion()) == "2025.10.2"


def test_detect_host_version_accepts_ptsl_year_from_engine_method(monkeypatch: pytest.MonkeyPatch) -> None:
    adapter = _adapter()

    class EngineWithYearVersion:
        def ptsl_version(self) -> int:
            return 2026

    monkeypatch.setattr(protools_adapter_module, "ptsl_ops", None)

    assert adapter._detect_host_version(EngineWithYearVersion()) == "2026.0.0"


def test_connect_honors_timeout_seconds_when_host_ready_check_hangs(monkeypatch: pytest.MonkeyPatch) -> None:
    release_event = threading.Event()

    class BlockingEngine:
        def __init__(self, **kwargs) -> None:
            self.kwargs = dict(kwargs)

        def host_ready_check(self) -> None:
            release_event.wait(timeout=1.0)

    monkeypatch.setattr(protools_adapter_module, "Engine", BlockingEngine)
    adapter = _adapter()

    started_at = time.monotonic()
    with pytest.raises(PrestoError) as exc_info:
        adapter.connect(timeout_seconds=0.01)
    elapsed = time.monotonic() - started_at
    release_event.set()

    exc = exc_info.value
    assert exc.code == "PTSL_CONNECT_FAILED"
    assert exc.capability == "daw.connection.connect"
    assert exc.details["timeout_seconds"] == 0.01
    assert elapsed < 0.5


class FakeSelectionEngine:
    host_version = TEST_PTSL_HOST_VERSION

    def __init__(self) -> None:
        self.selected_track_names: list[str] = []
        self.track_names = ["Kick", "Snare", "Bass", "Lead Vox", "Pad", "FX"]
        self.select_calls: list[list[str]] = []
        self.session_path = "/Sessions/Presto.ptx"
        self.renamed_tracks: list[tuple[str, str]] = []
        self.selected_clip_tracks: list[str] = []
        self.saved_sessions = 0
        self.transport_state = "stopped"
        self.record_mode_armed = False
        self.client = type("Client", (), {"run_command": self._run_command})()
        self.command_calls: list[tuple[object, dict[str, object]]] = []

    def _run_command(self, command_id, request):
        self.command_calls.append((command_id, request))
        if command_id == _pt_constant("CId_SelectTracksByName"):
            self.selected_track_names = [str(name) for name in request.get("track_names", [])]
            return _track_list_response(
                self.selected_track_names,
                selected_track_names=set(self.selected_track_names),
            )
        if command_id == _pt_constant("CId_GetTrackList"):
            return _track_list_response(
                self.track_names,
                selected_track_names=set(self.selected_track_names),
            )
        if command_id == _pt_constant("CId_RenameTargetTrack"):
            current_name = str(request.get("current_name", ""))
            new_name = str(request.get("new_name", ""))
            self.renamed_tracks.append((current_name, new_name))
            if current_name and new_name:
                self.track_names = [new_name if name == current_name else name for name in self.track_names]
            return {}
        if command_id == _pt_constant("CId_SelectAllClipsOnTrack"):
            track_name = str(request.get("track_name", ""))
            if track_name:
                self.selected_clip_tracks.append(track_name)
            return {}
        if command_id == _pt_constant("CId_SaveSession"):
            self.saved_sessions += 1
            return None
        if command_id == _pt_constant("CId_SetTrackColor"):
            return {"success_count": len(request.get("track_names", []))}
        if command_id == _pt_constant("CId_GetExportMixSourceList"):
            source_type = str(request.get("type", ""))
            return {"source_list": [f"{source_type}-A", f"{source_type}-B"]}
        if command_id == _pt_constant("CId_GetTransportState"):
            transport_state_map = {
                "playing": _pt_constant("TS_TransportPlaying"),
                "stopped": _pt_constant("TS_TransportStopped"),
                "recording": _pt_constant("TS_TransportRecording"),
            }
            return {"current_setting": transport_state_map[self.transport_state]}
        if command_id == _pt_constant("CId_SetPlaybackMode"):
            return {"current_setting": 0}
        if command_id == _pt_constant("CId_SetRecordMode"):
            self.record_mode_armed = bool(request.get("record_arm_transport"))
            return {"current_setting": 0}
        if command_id == _pt_constant("CId_TogglePlayState"):
            if self.transport_state == "playing":
                self.transport_state = "stopped"
            elif self.transport_state == "recording":
                self.transport_state = "stopped"
            else:
                self.transport_state = "recording" if self.record_mode_armed else "playing"
            return {"current_setting": 0}
        return {}


class FakeImportEngine:
    host_version = TEST_PTSL_HOST_VERSION

    def __init__(self) -> None:
        self.session_path = "/Sessions/Presto.ptx"
        self.import_calls: list[dict[str, object]] = []
        self.track_names = ["Existing"]
        self.client = type("Client", (), {"run_command": self._run_command})()

    def _run_command(self, command_id, request):
        if command_id == _pt_constant("CId_GetTrackList"):
            return _track_list_response(self.track_names)
        if command_id != _pt_constant("CId_Import"):
            return {}
        self.import_calls.append(dict(request))
        audio_data = request.get("audio_data", {})
        new_files = audio_data.get("file_list", [])
        for file_path in new_files:
            stem = Path(str(file_path)).stem
            self.track_names.append(stem)
        return None


class FakeReorderedImportEngine:
    host_version = TEST_PTSL_HOST_VERSION

    def __init__(self) -> None:
        self.session_path = "/Sessions/Presto.ptx"
        self.import_calls: list[dict[str, object]] = []
        self.track_names = ["Existing"]
        self.client = type("Client", (), {"run_command": self._run_command})()

    def _run_command(self, command_id, request):
        if command_id == _pt_constant("CId_GetTrackList"):
            return _track_list_response(self.track_names)
        if command_id != _pt_constant("CId_Import"):
            return {}
        self.import_calls.append(dict(request))
        audio_data = request.get("audio_data", {})
        new_files = audio_data.get("file_list", [])
        new_stems = [Path(str(file_path)).stem for file_path in new_files]
        if len(new_stems) > 1:
            self.track_names.extend(sorted(new_stems))
            return None
        self.track_names.extend(new_stems)
        return None


class FakeTimelineEngine:
    host_version = TEST_PTSL_HOST_VERSION

    def __init__(self) -> None:
        self.session_path = "/Sessions/Presto.ptx"
        self.command_calls: list[tuple[object, dict[str, object]]] = []
        self.selection = ("00:00:00:00", "00:00:00:00")
        self.client = type("Client", (), {"run_command": self._run_command})()

    def _run_command(self, command_id, request):
        self.command_calls.append((command_id, dict(request)))
        if command_id == _pt_constant("CId_SetTimelineSelection"):
            self.selection = (str(request.get("in_time", "")), str(request.get("out_time", "")))
            return None
        if command_id == _pt_constant("CId_GetTimelineSelection"):
            return {"in_time": self.selection[0], "out_time": self.selection[1]}
        return None


class FakeTrackSelectionStateEngine:
    host_version = TEST_PTSL_HOST_VERSION

    def __init__(self) -> None:
        self.session_path = "/Sessions/Presto.ptx"
        self.client = type("Client", (), {"run_command": self._run_command})()

    def _run_command(self, command_id, request):
        if command_id != _pt_constant("CId_GetTrackList"):
            return None
        return _track_list_response(
            ["Kick", "Snare"],
            selected_track_names={"Snare"},
            track_formats={"Kick": "TF_Stereo", "Snare": "TF_Mono"},
        )


class FakeExportEngine:
    host_version = TEST_PTSL_HOST_VERSION

    def __init__(self) -> None:
        self.session_path = "/Sessions/Presto.ptx"
        self.command_calls: list[tuple[object, dict[str, object]]] = []
        self.client = type("Client", (), {"run_command": self._run_command})()

    def _run_command(self, command_id, request):
        self.command_calls.append((command_id, dict(request)))
        return None


def test_select_track_uses_ptsl_selection_by_name() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.select_track("Kick")

    assert engine.select_calls == []
    assert engine.command_calls == [
        (
            _pt_constant("CId_SelectTracksByName"),
            {
                "track_names": ["Kick"],
                "selection_mode": "SM_Replace",
            },
        )
    ]


def test_set_track_mute_state_batch_uses_single_ptsl_command() -> None:
    adapter = _adapter()
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.set_track_mute_state_batch(["Kick", "Snare"], True)

    assert engine.command_calls[-1] == (
        _pt_constant("CId_SetTrackMuteState"),
        {"track_names": ["Kick", "Snare"], "enabled": True},
    )


def test_set_track_solo_state_batch_uses_single_ptsl_command() -> None:
    adapter = _adapter()
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.set_track_solo_state_batch(["Kick", "Snare"], False)

    assert engine.command_calls[-1] == (
        _pt_constant("CId_SetTrackSoloState"),
        {"track_names": ["Kick", "Snare"], "enabled": False},
    )


@pytest.mark.parametrize(
    ("method_name", "command_name"),
    [
        ("set_track_record_enable_state_batch", "CId_SetTrackRecordEnableState"),
        ("set_track_record_safe_state_batch", "CId_SetTrackRecordSafeEnableState"),
        ("set_track_input_monitor_state_batch", "CId_SetTrackInputMonitorState"),
        ("set_track_frozen_state_batch", "CId_SetTrackFrozenState"),
        ("set_track_open_state_batch", "CId_SetTrackOpenState"),
    ],
)
def test_new_track_toggle_batches_use_expected_ptsl_command(method_name: str, command_name: str) -> None:
    adapter = _adapter()
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    getattr(adapter, method_name)(["Kick"], True)

    assert engine.command_calls[-1] == (
        _pt_constant(command_name),
        {"track_names": ["Kick"], "enabled": True},
    )


def test_set_track_online_state_batch_uses_singular_ptsl_request() -> None:
    adapter = _adapter()
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.set_track_online_state_batch(["Kick"], True)

    assert engine.command_calls[-1] == (
        _pt_constant("CId_SetTrackOnlineState"),
        {"track_name": "Kick", "enabled": True},
    )


def test_set_track_online_state_batch_keeps_batch_interface_by_iterating_tracks() -> None:
    adapter = _adapter()
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.set_track_online_state_batch(["Kick", "Snare"], False)

    assert engine.command_calls[-2:] == [
        (_pt_constant("CId_SetTrackOnlineState"), {"track_name": "Kick", "enabled": False}),
        (_pt_constant("CId_SetTrackOnlineState"), {"track_name": "Snare", "enabled": False}),
    ]


def test_list_tracks_exposes_track_format_from_ptsl_track_list() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeImportEngine()
    adapter._engine = engine
    adapter._connected = True

    tracks = adapter.list_tracks()

    assert tracks[0].track_format == "stereo"


def test_get_selected_track_names_only_returns_tracks_with_selected_state() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeTrackSelectionStateEngine()
    adapter._engine = engine
    adapter._connected = True

    selected = adapter.get_selected_track_names()

    assert selected == ["Snare"]


def test_track_color_surface_does_not_expose_ui_probe_state() -> None:
    adapter = _adapter()

    assert not hasattr(adapter, "ensure_track_color_supported")
    assert not hasattr(adapter, "automation_engine")
    assert not hasattr(adapter, "ui_profile")


def test_list_ptsl_commands_exposes_full_catalog_metadata() -> None:
    adapter = _adapter()

    commands = adapter.list_ptsl_commands()

    assert len(commands) == len(list_commands())
    assert commands[0]["commandName"].startswith("CId_")
    assert "commandId" in commands[0]
    assert "requestMessage" in commands[0]
    assert "responseMessage" in commands[0]
    assert "hasPyPtslOp" in commands[0]
    assert "minimumHostVersion" in commands[0]
    assert "introducedVersion" not in commands[0]


def test_describe_ptsl_command_returns_single_catalog_entry() -> None:
    adapter = _adapter()

    command = adapter.describe_ptsl_command("CId_GetTrackList")

    assert command["commandName"] == "CId_GetTrackList"
    assert command["commandId"] == _pt_constant("CId_GetTrackList")
    assert command["requestMessage"] == "GetTrackListRequestBody"
    assert command["responseMessage"] == "GetTrackListResponseBody"
    assert command["minimumHostVersion"] == "2022.12.0"


def test_execute_ptsl_command_runs_generic_cataloged_command() -> None:
    adapter = _adapter()
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    response = adapter.execute_ptsl_command(
        "CId_SelectTracksByName",
        {
            "track_names": ["Kick"],
            "selection_mode": "SM_Replace",
        },
    )

    assert response["track_list"][0]["name"] == "Kick"
    assert engine.command_calls[-1] == (
        _pt_constant("CId_SelectTracksByName"),
        {
            "track_names": ["Kick"],
            "selection_mode": "SM_Replace",
        },
    )


def test_adapter_does_not_expose_command_id_resolution_helpers() -> None:
    assert not hasattr(ProToolsDawAdapter, "_resolve_command_id")
    assert not hasattr(ProToolsDawAdapter, "_resolve_export_mix_source_list_command_id")
    assert not hasattr(ProToolsDawAdapter, "_resolve_track_control_breakpoints_command_id")
    assert not hasattr(ProToolsDawAdapter, "_resolve_export_mix_command_id")


def test_apply_track_color_uses_track_names_request_from_proto() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.apply_track_color("Kick", 5)

    assert engine.select_calls == []
    assert engine.command_calls == [
        (
            _pt_constant("CId_SetTrackColor"),
            {"track_names": ["Kick"], "color_index": 5},
        )
    ]


def test_set_track_pan_is_not_exposed_through_ptsl_2026_catalog() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    with pytest.raises(PrestoError) as exc_info:
        adapter.set_track_pan("Kick", 0.0)

    assert exc_info.value.code == "TRACK_PAN_UNAVAILABLE"
    assert exc_info.value.capability == "daw.track.pan.set"
    assert engine.command_calls == []


def test_set_track_hidden_state_uses_ptsl_track_names_request() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.set_track_hidden_state("Kick", True)

    assert engine.command_calls == [(_pt_constant("CId_SetTrackHiddenState"), {"track_names": ["Kick"], "enabled": True})]


def test_set_track_inactive_state_uses_ptsl_track_names_request() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.set_track_inactive_state("Bass", False)

    assert engine.command_calls == [(_pt_constant("CId_SetTrackInactiveState"), {"track_names": ["Bass"], "enabled": False})]


def test_set_track_hidden_state_batch_uses_single_ptsl_command() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.set_track_hidden_state_batch(["Kick", "Snare"], True)

    assert engine.command_calls == [
        (_pt_constant("CId_SetTrackHiddenState"), {"track_names": ["Kick", "Snare"], "enabled": True})
    ]


def test_set_track_inactive_state_batch_uses_single_ptsl_command() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.set_track_inactive_state_batch(["Bass", "Lead Vox"], False)

    assert engine.command_calls == [
        (_pt_constant("CId_SetTrackInactiveState"), {"track_names": ["Bass", "Lead Vox"], "enabled": False})
    ]


def test_set_track_pan_rejects_out_of_range_values() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    with pytest.raises(PrestoError) as exc_info:
        adapter.set_track_pan("Kick", 1.25)

    exc = exc_info.value
    assert exc.code == "TRACK_PAN_VALUE_INVALID"
    assert exc.capability == "daw.track.pan.set"
    assert exc.details["track_name"] == "Kick"
    assert exc.details["value"] == 1.25
    assert engine.command_calls == []


def test_apply_track_color_requires_success_count_confirmation() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    def return_zero_success_count(self, command_id, request):
        engine.command_calls.append((command_id, request))
        return {"success_count": 0}

    engine.client = type("Client", (), {"run_command": return_zero_success_count})()

    with pytest.raises(PrestoError) as exc_info:
        adapter.apply_track_color("Kick", 5)

    exc = exc_info.value
    assert exc.code == "SET_TRACK_COLOR_FAILED"
    assert exc.capability == "daw.track.color.apply"
    assert exc.details["command_name"] == "CId_SetTrackColor"
    assert exc.details["track_name"] == "Kick"
    assert exc.details["color_slot"] == 5
    assert "success_count=0" in exc.message


def test_apply_track_color_rebinds_ptsl_failure_to_track_color_capability() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    def raise_invalid_parameter(command_id, request):
        raise RuntimeError("PT_InvalidParameter (Either 'track_ids' or 'track_names' must be defined and contain non-empty list.)")

    engine.client = type("Client", (), {"run_command": raise_invalid_parameter})()

    with pytest.raises(PrestoError) as exc_info:
        adapter.apply_track_color("Kick", 9)

    exc = exc_info.value
    assert exc.code == "SET_TRACK_COLOR_FAILED"
    assert exc.capability == "daw.track.color.apply"
    assert exc.details["track_name"] == "Kick"
    assert exc.details["color_slot"] == 9


def test_list_export_mix_sources_uses_ptsl_command_with_enum_name() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    response = adapter.list_export_mix_sources("output")

    assert response == ["EMSType_Output-A", "EMSType_Output-B"]
    assert engine.command_calls[-1] == (_pt_constant("CId_GetExportMixSourceList"), {"type": "EMSType_Output"})


def test_list_export_mix_sources_rebinds_ptsl_failure_to_export_capability() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    def raise_command_error(command_id, request):
        raise RuntimeError(f"ptsl failure: {command_id} {request}")

    engine.client = type("Client", (), {"run_command": raise_command_error})()

    with pytest.raises(PrestoError) as exc_info:
        adapter.list_export_mix_sources("bus")

    exc = exc_info.value
    assert exc.code == "EXPORT_MIX_SOURCE_LIST_FAILED"
    assert exc.capability == "daw.export.mixWithSource"
    assert exc.details["source_type"] == "bus"

def test_rename_track_uses_engine_rename() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.rename_track("Kick", "Kick In")

    assert engine.command_calls == [
        (
            _pt_constant("CId_RenameTargetTrack"),
            {
                "current_name": "Kick",
                "new_name": "Kick In",
            },
        )
    ]


def test_select_all_clips_on_track_uses_engine_command() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.select_all_clips_on_track("Kick")

    assert engine.selected_clip_tracks == ["Kick"]
    assert engine.command_calls == [
        (_pt_constant("CId_SelectAllClipsOnTrack"), {"track_name": "Kick"})
    ]


def test_get_transport_status_reads_ptsl_state() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    engine.transport_state = "recording"
    adapter._engine = engine
    adapter._connected = True

    status = adapter.get_transport_status()

    assert status.state == "recording"
    assert status.is_playing is False
    assert status.is_recording is True
    assert engine.command_calls[0][0] == 59


def test_play_uses_ptsl_transport_commands() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.play()

    assert engine.transport_state == "playing"
    assert [call[0] for call in engine.command_calls] == [59, 32, 64]


def test_stop_uses_ptsl_transport_toggle() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    engine.transport_state = "playing"
    adapter._engine = engine
    adapter._connected = True

    adapter.stop()

    assert engine.transport_state == "stopped"
    assert [call[0] for call in engine.command_calls] == [59, 64]


def test_record_uses_ptsl_record_mode_and_toggle() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.record()

    assert engine.transport_state == "recording"
    assert [call[0] for call in engine.command_calls] == [59, 33, 64]


def test_save_session_uses_engine_save_session() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.save_session()

    assert engine.saved_sessions == 1
    assert engine.command_calls == [(_pt_constant("CId_SaveSession"), {})]


def test_import_audio_files_uses_ptsl_import_and_detects_new_tracks() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeImportEngine()
    adapter._engine = engine
    adapter._connected = True

    imported = adapter.import_audio_files(["/tmp/Kick.wav", "/tmp/Snare.aiff"])

    assert imported == ["Kick", "Snare"]
    assert len(engine.import_calls) == 2
    assert engine.import_calls[0]["session_path"] == "/Sessions/Presto.ptx"
    assert engine.import_calls[0]["import_type"] == "Audio"
    assert engine.import_calls[0]["audio_data"]["file_list"] == [str(Path("/tmp/Kick.wav").resolve())]
    assert engine.import_calls[1]["session_path"] == "/Sessions/Presto.ptx"
    assert engine.import_calls[1]["import_type"] == "Audio"
    assert engine.import_calls[1]["audio_data"]["file_list"] == [str(Path("/tmp/Snare.aiff").resolve())]


def test_import_audio_files_preserves_requested_order_when_bulk_import_reorders_tracks() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeReorderedImportEngine()
    adapter._engine = engine
    adapter._connected = True

    imported = adapter.import_audio_files(["/tmp/Zeta.wav", "/tmp/Alpha.wav"])

    assert imported == ["Zeta", "Alpha"]
    assert len(engine.import_calls) == 2
    assert engine.import_calls[0]["session_path"] == "/Sessions/Presto.ptx"
    assert engine.import_calls[0]["audio_data"]["file_list"] == [str(Path("/tmp/Zeta.wav").resolve())]
    assert engine.import_calls[1]["session_path"] == "/Sessions/Presto.ptx"
    assert engine.import_calls[1]["audio_data"]["file_list"] == [str(Path("/tmp/Alpha.wav").resolve())]


def test_import_audio_files_uses_add_audio_operation_when_link_mode_is_requested() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeImportEngine()
    adapter._engine = engine
    adapter._connected = True

    imported = adapter.import_audio_files(["/tmp/Kick.wav"], import_mode="link")

    assert imported == ["Kick"]
    assert len(engine.import_calls) == 1
    assert engine.import_calls[0]["audio_data"]["audio_operations"] == "AddAudio"


def test_set_timeline_selection_uses_engine_wrapper_and_reads_back_selection() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeTimelineEngine()
    adapter._engine = engine
    adapter._connected = True

    selection = adapter.set_timeline_selection(in_time="00:00:01:00", out_time="00:00:05:00")

    assert selection == ("00:00:01:00", "00:00:05:00")
    assert engine.command_calls[0][0] == _pt_constant("CId_SetTimelineSelection")
    assert engine.command_calls[0][1]["in_time"] == "00:00:01:00"
    assert engine.command_calls[0][1]["out_time"] == "00:00:05:00"
    assert engine.command_calls[0][1]["location_type"] == "TLType_TimeCode"
    assert engine.command_calls[1] == (
        _pt_constant("CId_GetTimelineSelection"),
        {"location_type": "TLType_TimeCode"},
    )


def test_convert_posix_directory_to_hfs_handles_unicode_paths_without_osascript() -> None:
    result = _convert_posix_directory_to_hfs("/Users/loyan/Documents/配角伴奏分轨2/123")

    assert result.endswith(":")
    assert "配角伴奏分轨2" in result


def test_posix_directory_to_hfs_uses_resolved_path_and_trailing_colon() -> None:
    adapter = _adapter()

    result = adapter._posix_directory_to_hfs("/tmp/exports")

    assert result.endswith(":")
    assert "private:tmp:exports" in result


def test_export_mix_uses_posix_directory_and_default_physical_output(monkeypatch: pytest.MonkeyPatch) -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeExportEngine()
    adapter._engine = engine
    adapter._connected = True

    monkeypatch.setattr(
        adapter,
        "_posix_directory_to_hfs",
        lambda value: "Macintosh HD:Users:test:Exports:",
    )

    adapter.export_mix(
        output_path="/Users/test/Exports",
        file_name="mix-print",
        file_type="WAV",
        offline=True,
        audio_format="interleaved",
        bit_depth=24,
        sample_rate=48000,
    )

    assert len(engine.command_calls) == 1
    command_id, request = engine.command_calls[0]
    assert command_id == _pt_constant("CId_ExportMix")
    assert request["file_name"] == "mix-print"
    assert request["file_type"] == "EMFType_WAV"
    assert request["mix_source_list"] == [{"source_type": "EMSType_PhysicalOut", "name": "Out 1-2"}]
    assert request["location_info"]["directory"] == "Macintosh HD:Users:test:Exports:"
    assert request["location_info"]["file_destination"] == "EM_FD_Directory"
    assert request["offline_bounce"] == "TB_True"


def test_export_direct_start_reuses_export_mix_path(monkeypatch: pytest.MonkeyPatch) -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeExportEngine()
    adapter._engine = engine
    adapter._connected = True

    monkeypatch.setattr(
        adapter,
        "_posix_directory_to_hfs",
        lambda value: "Macintosh HD:Users:test:Exports:",
    )

    adapter.export_mix(
        output_path="/Users/test/Exports",
        file_name="clip-print",
        file_type="WAV",
        offline=True,
        audio_format="interleaved",
        bit_depth=24,
        sample_rate=48000,
    )

    assert engine.command_calls[-1][1]["file_name"] == "clip-print"


def test_export_mix_supports_directory_destination_for_workflow(monkeypatch: pytest.MonkeyPatch) -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeExportEngine()
    adapter._engine = engine
    adapter._connected = True

    monkeypatch.setattr(
        adapter,
        "_posix_directory_to_hfs",
        lambda value: "Macintosh HD:Users:test:Exports:",
    )

    adapter.export_mix(
        output_path="/Users/test/Exports",
        file_name="temp_export_Verse",
        file_type="WAV",
        offline=True,
        audio_format="interleaved",
        bit_depth=24,
        sample_rate=48000,
        file_destination="directory",
    )

    assert len(engine.command_calls) == 1
    request = engine.command_calls[0][1]
    assert request["file_name"] == "temp_export_Verse"
    assert request["location_info"]["file_destination"] == "EM_FD_Directory"
    assert request["location_info"]["directory"] == "Macintosh HD:Users:test:Exports:"


def test_export_mix_with_progress_delegates_to_export_mix_and_emits_start_and_complete(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeExportEngine()
    adapter._engine = engine
    adapter._connected = True

    monkeypatch.setattr(
        adapter,
        "_posix_directory_to_hfs",
        lambda value: "Macintosh HD:Users:test:Exports:",
    )

    events: list[dict[str, object]] = []
    task_id = adapter.export_mix_with_progress(
        output_path="/Users/test/Exports",
        file_name="mix-print",
        file_type="WAV",
        source_type="physical_out",
        source_name="Out 1-2",
        audio_format="interleaved",
        bit_depth=24,
        sample_rate=48000,
        file_destination="directory",
        task_id="task-export-1",
        poll_interval_seconds=0.0,
        on_progress=events.append,
    )

    assert task_id == "task-export-1"
    assert len(engine.command_calls) == 1
    assert [event["status"] for event in events] == ["running", "completed"]
    assert [event["progressPercent"] for event in events] == [0.0, 100.0]
    assert all(event["taskId"] == "task-export-1" for event in events)


def test_export_mix_with_progress_rebinds_export_mix_failures_and_includes_task_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    def raise_export_error(**_kwargs):
        raise PrestoError(
            "EXPORT_MIX_FAILED",
            "send failed",
            capability="daw.export.start",
            adapter="pro_tools",
            details={"exception_type": "RuntimeError"},
        )

    monkeypatch.setattr(adapter, "export_mix", raise_export_error)

    with pytest.raises(PrestoError) as exc_info:
        adapter.export_mix_with_progress(
            output_path="/Users/test/Exports",
            file_name="mix-print",
            file_type="WAV",
            task_id="task-export-send-failed",
        )

    exc = exc_info.value
    assert exc.code == "EXPORT_MIX_FAILED"
    assert exc.capability == "daw.export.start"
    assert exc.details["task_id"] == "task-export-send-failed"
    assert exc.details["exception_type"] == "RuntimeError"
