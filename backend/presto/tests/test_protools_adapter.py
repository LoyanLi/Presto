from __future__ import annotations

import subprocess
import threading
import time
from pathlib import Path
import pytest

from presto.integrations.daw import protools_adapter as protools_adapter_module
from presto.domain.errors import PrestoError
from presto.integrations.daw.protools_adapter import ProToolsDawAdapter, _convert_posix_directory_to_hfs


def _adapter() -> ProToolsDawAdapter:
    return ProToolsDawAdapter(address="127.0.0.1:31416")


def _pt_constant(name: str) -> int:
    value = getattr(protools_adapter_module.pt, name, None)
    if not isinstance(value, int):
        raise AssertionError(f"missing ptsl constant {name}")
    return value


def test_coerce_session_length_seconds_uses_session_timecode_rate() -> None:
    adapter = _adapter()

    seconds = adapter._coerce_session_length_seconds("00:00:10:15", 5)

    assert seconds == 10.5


def test_coerce_session_length_seconds_handles_drop_frame_rate() -> None:
    adapter = _adapter()

    seconds = adapter._coerce_session_length_seconds("00:01:00:02", 4)

    assert round(seconds, 3) == 60.06


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
    def __init__(self) -> None:
        self.selected_track_names: list[str] = []
        self.select_calls: list[list[str]] = []
        self.session_path = "/Sessions/Presto.ptx"
        self.renamed_tracks: list[tuple[str, str]] = []
        self.selected_clip_tracks: list[str] = []
        self.saved_sessions = 0
        self.transport_state = "stopped"
        self.record_mode_armed = False
        self.client = type("Client", (), {"run_command": self._run_command})()
        self.command_calls: list[tuple[object, dict[str, object]]] = []

    def select_tracks_by_name(self, track_names: list[str]) -> None:
        self.select_calls.append(track_names)
        self.selected_track_names = list(track_names)

    def rename_target_track(self, current_name: str, new_name: str) -> None:
        self.renamed_tracks.append((current_name, new_name))

    def select_all_clips_on_track(self, track_name: str) -> None:
        self.selected_clip_tracks.append(track_name)

    def save_session(self) -> None:
        self.saved_sessions += 1

    def _run_command(self, command_id, request):
        self.command_calls.append((command_id, request))
        if command_id == 73:
            self.selected_track_names = [str(name) for name in request.get("track_names", [])]
            return {"track_names": list(self.selected_track_names)}
        if command_id == 8:
            current_name = str(request.get("current_name", ""))
            new_name = str(request.get("new_name", ""))
            self.renamed_tracks.append((current_name, new_name))
            return {}
        if command_id == 128:
            source_type = str(request.get("type", ""))
            return {"source_list": [f"{source_type}-A", f"{source_type}-B"]}
        if command_id == 59:
            transport_state_map = {
                "playing": _pt_constant("TS_TransportPlaying"),
                "stopped": _pt_constant("TS_TransportStopped"),
                "recording": _pt_constant("TS_TransportRecording"),
            }
            return {"current_setting": transport_state_map[self.transport_state]}
        if command_id == 32:
            return {"current_setting": 0}
        if command_id == 33:
            self.record_mode_armed = bool(request.get("record_arm_transport"))
            return {"current_setting": 0}
        if command_id == 64:
            if self.transport_state == "playing":
                self.transport_state = "stopped"
            elif self.transport_state == "recording":
                self.transport_state = "stopped"
            else:
                self.transport_state = "recording" if self.record_mode_armed else "playing"
            return {"current_setting": 0}
        return {"success_count": len(request.get("track_names", []))}


class FakeImportEngine:
    def __init__(self) -> None:
        self.session_path = "/Sessions/Presto.ptx"
        self.import_calls: list[dict[str, object]] = []
        self.track_names = ["Existing"]
        self.client = type("Client", (), {"run_command": self._run_command})()

    def track_list(self):
        return [
            type(
                "Track",
                (),
                {
                    "id": index + 1,
                    "name": name,
                    "type": 2,
                    "format": 2,
                    "track_attributes": type("Attrs", (), {"is_muted": False, "is_soloed": False})(),
                    "color": None,
                },
            )()
            for index, name in enumerate(self.track_names)
        ]

    def _run_command(self, command_id, request):
        if command_id != 2:
            return {}
        self.import_calls.append(dict(request))
        audio_data = request.get("audio_data", {})
        new_files = audio_data.get("file_list", [])
        for file_path in new_files:
            stem = Path(str(file_path)).stem
            self.track_names.append(stem)
        return None


class FakeReorderedImportEngine:
    def __init__(self) -> None:
        self.session_path = "/Sessions/Presto.ptx"
        self.import_calls: list[dict[str, object]] = []
        self.track_names = ["Existing"]
        self.client = type("Client", (), {"run_command": self._run_command})()

    def track_list(self):
        return [
            type(
                "Track",
                (),
                {
                    "id": index + 1,
                    "name": name,
                    "type": 2,
                    "format": 2,
                    "track_attributes": type("Attrs", (), {"is_muted": False, "is_soloed": False})(),
                    "color": None,
                },
            )()
            for index, name in enumerate(self.track_names)
        ]

    def _run_command(self, command_id, request):
        if command_id != 2:
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
    def __init__(self) -> None:
        self.session_path = "/Sessions/Presto.ptx"
        self.set_calls: list[dict[str, object]] = []
        self.selection = ("00:00:00:00", "00:00:00:00")

    def set_timeline_selection(self, **kwargs) -> None:
        self.set_calls.append(dict(kwargs))
        self.selection = (str(kwargs.get("in_time", "")), str(kwargs.get("out_time", "")))

    def get_timeline_selection(self):
        return self.selection


class FakeTrackSelectionStateEngine:
    def __init__(self) -> None:
        self.session_path = "/Sessions/Presto.ptx"

    def track_list(self):
        return [
            type(
                "Track",
                (),
                {
                    "id": 1,
                    "name": "Kick",
                    "type": 2,
                    "format": 2,
                    "track_attributes": type("Attrs", (), {"is_selected": 1})(),
                },
            )(),
            type(
                "Track",
                (),
                {
                    "id": 2,
                    "name": "Snare",
                    "type": 2,
                    "format": 1,
                    "track_attributes": type("Attrs", (), {"is_selected": 2})(),
                },
            )(),
        ]


class FakeExportEngine:
    def __init__(self) -> None:
        self.session_path = "/Sessions/Presto.ptx"
        self.export_mix_calls: list[dict[str, object]] = []

    def export_mix(self, *args) -> None:
        self.export_mix_calls.append({"args": args})


def test_select_track_uses_ptsl_selection_by_name() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.select_track("Kick")

    assert engine.select_calls == []
    assert engine.command_calls == [
        (
            73,
            {
                "track_names": ["Kick"],
                "selection_mode": "SM_Replace",
            },
        )
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
    assert not hasattr(adapter, "_set_track_color_command_id")
    assert not hasattr(adapter, "automation_engine")
    assert not hasattr(adapter, "ui_profile")


def test_set_track_color_uses_default_command_id() -> None:
    assert ProToolsDawAdapter.DEFAULT_SET_TRACK_COLOR_COMMAND_ID == 153


def test_apply_track_color_uses_track_names_request_from_proto() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.apply_track_color("Kick", 5)

    assert engine.select_calls == []
    assert engine.command_calls == [(153, {"track_names": ["Kick"], "color_index": 5})]


def test_set_track_pan_uses_track_control_breakpoints_command() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True
    adapter._resolve_track_control_breakpoints_command_id = lambda: 150  # type: ignore[method-assign]

    adapter.set_track_pan("Kick", 0.0)

    assert engine.command_calls == [
        (
            150,
            {
                "track_name": "Kick",
                "control_id": {
                    "section": "TSId_MainOut",
                    "control_type": "TCType_Pan",
                    "pan": {
                        "pan_space": "PSpace_Stereo",
                        "parameter": "PCParameter_Pan",
                        "channel": "SChannel_Mono",
                    },
                },
                "breakpoints": [
                    {
                        "time": {
                            "location": "0",
                            "time_type": "TLType_Samples",
                        },
                        "value": 0.0,
                    }
                ],
            },
        )
    ]


def test_set_track_hidden_state_uses_ptsl_track_names_request() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    command_id = adapter._resolve_command_id("SetTrackHiddenState")
    adapter.set_track_hidden_state("Kick", True)

    assert engine.command_calls == [(command_id, {"track_names": ["Kick"], "enabled": True})]


def test_set_track_inactive_state_uses_ptsl_track_names_request() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    command_id = adapter._resolve_command_id("SetTrackInactiveState")
    adapter.set_track_inactive_state("Bass", False)

    assert engine.command_calls == [(command_id, {"track_names": ["Bass"], "enabled": False})]


def test_set_track_pan_rejects_out_of_range_values() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    with pytest.raises(PrestoError) as exc_info:
        adapter.set_track_pan("Kick", 1.25)

    exc = exc_info.value
    assert exc.code == "TRACK_PAN_VALUE_INVALID"
    assert exc.capability == "track.pan.set"
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
    assert exc.capability == "track.color.apply"
    assert exc.details["command_id"] == 153
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
    assert exc.capability == "track.color.apply"
    assert exc.details["track_name"] == "Kick"
    assert exc.details["color_slot"] == 9


def test_list_export_mix_sources_uses_ptsl_command_with_enum_name() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    response = adapter.list_export_mix_sources("output")

    assert response == ["EMSType_Output-A", "EMSType_Output-B"]
    assert engine.command_calls[-1] == (128, {"type": "EMSType_Output"})


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
    assert exc.capability == "export.mixWithSource"
    assert exc.details["source_type"] == "bus"


def test_list_export_mix_sources_falls_back_to_default_command_id_when_generated_constant_is_missing(monkeypatch) -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    original_resolve_command_id = ProToolsDawAdapter._resolve_command_id

    def fake_resolve_command_id(name: str) -> int:
        if name in ("GetExportMixSourceList", "CId_GetExportMixSourceList"):
            raise PrestoError(
                "PTSL_COMMAND_UNAVAILABLE",
                f"PTSL command id '{name}' not found.",
                source="runtime",
                retryable=False,
                capability="export.mixWithSource",
                adapter="pro_tools",
            )
        return original_resolve_command_id(name)

    monkeypatch.setattr(ProToolsDawAdapter, "_resolve_command_id", staticmethod(fake_resolve_command_id))

    response = adapter.list_export_mix_sources("output")

    assert response == ["EMSType_Output-A", "EMSType_Output-B"]
    assert engine.command_calls[-1] == (128, {"type": "EMSType_Output"})


def test_rename_track_uses_engine_rename() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeSelectionEngine()
    adapter._engine = engine
    adapter._connected = True

    adapter.rename_track("Kick", "Kick In")

    assert engine.command_calls == [
        (
            8,
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


def test_import_audio_files_uses_ptsl_import_and_detects_new_tracks() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeImportEngine()
    adapter._engine = engine
    adapter._connected = True

    imported = adapter.import_audio_files(["/tmp/Kick.wav", "/tmp/Snare.aiff"])

    assert imported == ["Kick", "Snare"]
    assert len(engine.import_calls) == 2
    assert engine.import_calls[0]["session_path"] == "/Sessions/Presto.ptx"
    assert engine.import_calls[0]["audio_data"]["file_list"] == [str(Path("/tmp/Kick.wav").resolve())]
    assert engine.import_calls[1]["session_path"] == "/Sessions/Presto.ptx"
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


def test_set_timeline_selection_uses_engine_wrapper_and_reads_back_selection() -> None:
    adapter = ProToolsDawAdapter(address="127.0.0.1:31416")
    engine = FakeTimelineEngine()
    adapter._engine = engine
    adapter._connected = True

    selection = adapter.set_timeline_selection(in_time="00:00:01:00", out_time="00:00:05:00")

    assert selection == ("00:00:01:00", "00:00:05:00")
    assert engine.set_calls == [{"in_time": "00:00:01:00", "out_time": "00:00:05:00"}]


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

    assert len(engine.export_mix_calls) == 1
    call = engine.export_mix_calls[0]["args"]
    assert call[0] == "mix-print"
    assert call[1] == _pt_constant("EM_WAV")
    assert call[2][0].name == "Out 1-2"
    assert call[2][0].source_type == _pt_constant("PhysicalOut")
    assert call[5].directory == "Macintosh HD:Users:test:Exports:"
    assert call[5].file_destination == _pt_constant("EM_FD_Directory")
    assert call[7] == _pt_constant("TB_True")


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

    assert engine.export_mix_calls[-1]["args"][0] == "clip-print"


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

    assert len(engine.export_mix_calls) == 1
    call = engine.export_mix_calls[0]["args"]
    assert call[0] == "temp_export_Verse"
    assert call[5].file_destination == _pt_constant("EM_FD_Directory")
    assert call[5].directory == "Macintosh HD:Users:test:Exports:"


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
    assert len(engine.export_mix_calls) == 1
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
            capability="export.start",
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
    assert exc.capability == "export.start"
    assert exc.details["task_id"] == "task-export-send-failed"
    assert exc.details["exception_type"] == "RuntimeError"
