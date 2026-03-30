from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

project_root = Path(__file__).resolve().parents[2]
project_root_str = str(project_root)
if project_root_str not in sys.path:
    sys.path.insert(0, project_root_str)

from presto.main_api import create_app
from presto.transport.http.routes.health import health
from presto.transport.http.routes.invoke import invoke_capability
from presto.transport.http.schemas.capabilities import CapabilityInvokeRequestSchema
from presto.application.service_container import build_service_container
from presto.integrations.daw.base import DawAdapterCapabilitySnapshot, DawConnectionStatus, DawSessionInfo, DawTrackInfo


class DummyRequest(SimpleNamespace):
    app: object


class FakeDawAdapter:
    def __init__(self) -> None:
        self.connected = False
        self.connection_host: str | None = None
        self.connection_port: int | None = None
        self.import_calls: list[list[str]] = []
        self.timeline_selection = ("00:00:00:00", "00:00:00:00")
        self.timeline_selection_calls: list[dict[str, object]] = []
        self.export_mix_calls: list[dict[str, object]] = []
        self.export_mix_source_list_calls: list[str] = []
        self.selected_tracks: list[str] = []
        self.applied_colors: list[tuple[str, int]] = []
        self.pan_updates: list[tuple[str, float]] = []
        self.saved_sessions = 0
        self.renamed_tracks: list[tuple[str, str]] = []
        self.mute_updates: list[tuple[str, bool]] = []
        self.solo_updates: list[tuple[str, bool]] = []
        self.selected_clip_tracks: list[str] = []
        self.transport_state = "stopped"
        self.transport_command_calls: list[tuple[int, dict[str, object]]] = []
        self.record_mode_armed = False
        self.track_catalog: list[dict[str, object]] = [
            {
                "id": "track-1",
                "name": "Kick",
                "type": "audio",
                "format": "stereo",
                "is_muted": False,
                "is_soloed": False,
                "color": "#ffbd520e",
            },
            {
                "id": "track-2",
                "name": "Piano",
                "type": "audio",
                "format": "stereo",
                "is_muted": False,
                "is_soloed": False,
                "color": "#ffbd520d",
            },
            {
                "id": "track-3",
                "name": "Snare",
                "type": "audio",
                "format": "mono",
                "is_muted": False,
                "is_soloed": False,
                "color": "#ffbd520f",
            },
            {
                "id": "track-4",
                "name": "Bass",
                "type": "audio",
                "format": "mono",
                "is_muted": False,
                "is_soloed": False,
                "color": "#ffbd5210",
            },
        ]

    def is_connected(self) -> bool:
        return self.connected

    def connect(self, host: str | None = None, port: int | None = None, timeout_seconds: int | None = None) -> bool:
        _ = timeout_seconds
        self.connected = True
        self.connection_host = host
        self.connection_port = port
        return True

    def disconnect(self) -> None:
        self.connected = False

    def get_connection_status(self) -> DawConnectionStatus:
        return DawConnectionStatus(
            connected=self.connected,
            session_open=self.connected,
            host_version="2025.10",
            session_name="Presto",
            session_path="/Sessions/Presto.ptx" if self.connected else None,
        )

    def get_adapter_capability_snapshot(self) -> DawAdapterCapabilitySnapshot:
        return DawAdapterCapabilitySnapshot(
            adapter_version="2025.10.0",
            host_version="2025.10",
            module_versions={
                "daw": "2025.10.0",
                "connection": "2025.10.0",
                "session": "2025.10.0",
                "track": "2025.10.0",
                "import": "2025.10.0",
                "export": "2025.10.0",
                "automation": "2025.10.0",
            },
            capability_versions={},
        )

    def get_transport_status(self):
        return type(
            "TransportStatus",
            (),
            {
                "state": self.transport_state,
                "is_playing": self.transport_state == "playing",
                "is_recording": self.transport_state == "recording",
            },
        )()

    def get_session_info(self) -> DawSessionInfo:
        return DawSessionInfo(
            session_name="Presto",
            session_path="/Sessions/Presto.ptx",
            sample_rate=48000,
            bit_depth=32,
            is_playing=False,
            is_recording=False,
        )

    def get_session_length(self) -> float:
        return 183.5

    def import_audio_files(self, paths: list[str]) -> list[str]:
        self.import_calls.append(list(paths))
        return [Path(path).stem for path in paths]

    def set_timeline_selection(self, **kwargs) -> tuple[str, str]:
        self.timeline_selection_calls.append(dict(kwargs))
        self.timeline_selection = (
            str(kwargs.get("in_time", "")),
            str(kwargs.get("out_time", "")),
        )
        return self.timeline_selection

    def get_timeline_selection(self) -> tuple[str, str]:
        return self.timeline_selection

    def export_mix(self, **kwargs) -> None:
        self.export_mix_calls.append(dict(kwargs))

    def list_export_mix_sources(self, source_type: str) -> list[str]:
        self.export_mix_source_list_calls.append(source_type)
        return [f"{source_type}-1", f"{source_type}-2"]

    def list_tracks(self) -> list[DawTrackInfo]:
        return [
            DawTrackInfo(
                track_id=str(track["id"]),
                track_name=str(track["name"]),
                track_type=str(track["type"]),
                track_format=str(track["format"]),
                is_muted=bool(track["is_muted"]),
                is_soloed=bool(track["is_soloed"]),
                color=str(track["color"]) if track.get("color") is not None else None,
            )
            for track in self.track_catalog
        ]

    def list_track_names(self) -> list[str]:
        return [str(track["name"]) for track in self.track_catalog]

    def select_track(self, track_name: str) -> None:
        self.selected_tracks = [track_name]

    def select_tracks(self, track_names: list[str]) -> None:
        self.selected_tracks = [str(track_name) for track_name in track_names]

    def get_selected_track_names(self) -> list[str]:
        return list(self.selected_tracks)

    def apply_track_color(self, track_name: str, color_slot: int) -> None:
        self.applied_colors.append((track_name, color_slot))

    def set_track_pan(self, track_name: str, pan: float) -> None:
        self.pan_updates.append((track_name, pan))

    def save_session(self) -> None:
        self.saved_sessions += 1

    def rename_track(self, current_name: str, new_name: str) -> None:
        self.renamed_tracks.append((current_name, new_name))
        for track in self.track_catalog:
            if str(track["name"]) == current_name:
                track["name"] = new_name
                break

    def set_track_mute_state(self, track_name: str, muted: bool) -> None:
        self.mute_updates.append((track_name, muted))

    def set_track_solo_state(self, track_name: str, soloed: bool) -> None:
        self.solo_updates.append((track_name, soloed))

    def select_all_clips_on_track(self, track_name: str) -> None:
        self.selected_clip_tracks.append(track_name)

    def play(self) -> None:
        self.transport_state = "playing"

    def stop(self) -> None:
        self.transport_state = "stopped"

    def record(self) -> None:
        self.transport_state = "recording"

    def debug_split_selected_stereo_track(self) -> None:
        new_selected_tracks: list[str] = []
        next_index = len(self.track_catalog) + 1

        for selected_name in list(self.selected_tracks):
            track = next((item for item in self.track_catalog if str(item["name"]) == selected_name), None)
            if track is None or str(track["format"]) != "stereo":
                continue

            self.track_catalog.extend([
                {
                    "id": f"track-{next_index}",
                    "name": f"{selected_name}.L",
                    "type": str(track["type"]),
                    "format": "mono",
                    "is_muted": False,
                    "is_soloed": False,
                    "color": track.get("color"),
                },
                {
                    "id": f"track-{next_index + 1}",
                    "name": f"{selected_name}.R",
                    "type": str(track["type"]),
                    "format": "mono",
                    "is_muted": False,
                    "is_soloed": False,
                    "color": track.get("color"),
                },
            ])
            new_selected_tracks.extend([f"{selected_name}.L", f"{selected_name}.R"])
            next_index += 2

        if new_selected_tracks:
            self.selected_tracks = new_selected_tracks

    def debug_delete_selected_track(self) -> None:
        if not self.selected_tracks:
            return
        selected_names = set(self.selected_tracks)
        self.track_catalog = [track for track in self.track_catalog if str(track["name"]) not in selected_names]
        self.selected_tracks = []


class FakeConfigStore:
    def __init__(self) -> None:
        self.config = {
            "categories": [],
            "silenceProfile": {
                "thresholdDb": -40,
                "minStripMs": 50,
                "minSilenceMs": 250,
                "startPadMs": 0,
                "endPadMs": 0,
            },
            "aiNaming": {
                "enabled": False,
                "baseUrl": "",
                "model": "",
                "timeoutSeconds": 30,
                "keychainService": "openai",
                "keychainAccount": "api_key",
            },
            "uiPreferences": {
                "logsCollapsedByDefault": True,
                "followSystemTheme": True,
                "developerModeEnabled": True,
            },
        }

    def load(self):
        return self.config

    def save(self, config):
        self.config = config


class FakeKeychainStore:
    def __init__(self) -> None:
        self.values: dict[tuple[str, str], str] = {}

    def get_api_key(self, service: str, account: str) -> str | None:
        return self.values.get((service, account))

    def set_api_key(self, service: str, account: str, api_key: str) -> None:
        self.values[(service, account)] = api_key

    def delete_api_key(self, service: str, account: str) -> None:
        self.values.pop((service, account), None)


class FakeMacAutomationEngine:
    def __init__(self, daw: FakeDawAdapter | None = None) -> None:
        self.scripts: list[str] = []
        self.daw = daw

    def run_script(self, script: str) -> str:
        self.scripts.append(script)
        if self.daw is not None:
            if script == "menu:Track>Split into Mono":
                self.daw.debug_split_selected_stereo_track()
            elif script == "delete-selected-track":
                self.daw.debug_delete_selected_track()
        return ""


class FakeUiProfile:
    def __init__(self) -> None:
        self.open_script_calls = 0
        self.execute_script_calls = 0
        self.menu_click_paths: list[tuple[str, ...]] = []
        self.pan_reset_requests: list[tuple[str, float]] = []

    def build_preflight_accessibility_script(self) -> str:
        return "preflight"

    def build_open_strip_silence_script(self) -> str:
        self.open_script_calls += 1
        return "open-strip-silence"

    def build_execute_strip_silence_script(self) -> str:
        self.execute_script_calls += 1
        return "execute-strip-silence"

    def build_click_menu_item_script(self, *menu_path: str) -> str:
        self.menu_click_paths.append(tuple(menu_path))
        return f"menu:{'>'.join(menu_path)}"

    def build_delete_selected_track_script(self) -> str:
        return "delete-selected-track"

    def build_set_track_pan_script(self, track_name: str, pan: float) -> str:
        self.pan_reset_requests.append((track_name, pan))
        return f"set-track-pan:{track_name}:{pan}"


def _app_with_fake_daw() -> object:
    app = create_app()
    app.state.services = build_service_container(daw=FakeDawAdapter())
    return app


def _create_audio_source_folder(tmp_path: Path, *, file_names: list[str]) -> Path:
    root = tmp_path / "source"
    root.mkdir(parents=True, exist_ok=True)
    for file_name in file_names:
        (root / file_name).write_bytes(b"RIFF")
    return root


def _app_with_fake_daw_and_config() -> object:
    app = create_app()
    app.state.services = build_service_container(
        daw=FakeDawAdapter(),
        config_store=FakeConfigStore(),
        keychain_store=FakeKeychainStore(),
    )
    return app


def _app_with_fake_strip_silence() -> object:
    app = create_app()
    daw = FakeDawAdapter()
    app.state.services = build_service_container(
        daw=daw,
        mac_automation=FakeMacAutomationEngine(daw),
        daw_ui_profile=FakeUiProfile(),
    )
    return app


def test_invoke_system_health_returns_backend_status() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-1",
            capability="system.health",
            payload={},
            meta={
                "clientName": "workflow-runtime",
                "clientVersion": "0.1.0",
                "sdkVersion": "0.1.0",
            },
        ),
    )

    assert response.success is True
    assert response.requestId == "req-1"
    assert response.capability == "system.health"
    assert response.data == {
        "backendReady": True,
        "dawConnected": True,
        "activeDaw": "pro_tools",
    }


def test_invoke_unknown_capability_returns_normalized_error() -> None:
    app = create_app()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-2",
            capability="unknown.capability",
            payload={},
        ),
    )

    assert response.success is False
    assert response.requestId == "req-2"
    assert response.capability == "unknown.capability"
    assert response.error.code == "VALIDATION_ERROR"
    assert response.error.capability == "unknown.capability"
    assert response.error.details["capability_id"] == "unknown.capability"


def test_invoke_daw_connection_get_status_returns_live_shape() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-3",
            capability="daw.connection.getStatus",
            payload={},
        ),
    )

    assert response.success is True
    assert response.data == {
        "connected": True,
        "targetDaw": "pro_tools",
    }


def test_invoke_daw_adapter_get_snapshot_returns_capability_snapshot() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-3-snapshot",
            capability="daw.adapter.getSnapshot",
            payload={},
        ),
    )

    assert response.success is True
    assert response.data["targetDaw"] == "pro_tools"
    assert response.data["adapterVersion"] == "2025.10.0"
    assert response.data["hostVersion"] == "2025.10"
    assert response.data["modules"]
    module_ids = {module["moduleId"] for module in response.data["modules"]}
    assert "connection" in module_ids
    assert response.data["capabilities"]
    capability_ids = {item["capabilityId"] for item in response.data["capabilities"]}
    assert "export.mixWithSource" in capability_ids
    assert response.data["capabilities"][0]["capabilityId"]
    assert response.data["capabilities"][0]["moduleId"]
    assert response.data["capabilities"][0]["version"]


def test_invoke_config_get_returns_config_payload() -> None:
    app = _app_with_fake_daw_and_config()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-3a",
            capability="config.get",
            payload={},
        ),
    )

    assert response.success is True
    assert response.data["config"]["aiNaming"]["keychainService"] == "openai"


def test_invoke_config_update_saves_config_and_api_key() -> None:
    app = _app_with_fake_daw_and_config()
    request = DummyRequest(app=app)
    config = app.state.services.config_store.load()
    config["uiPreferences"]["developerModeEnabled"] = False

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-3b",
            capability="config.update",
            payload={
                "config": config,
                "apiKey": "sk-test",
            },
        ),
    )

    assert response.success is True
    assert response.data == {"saved": True}
    assert app.state.services.config_store.load()["uiPreferences"]["developerModeEnabled"] is False
    assert app.state.services.keychain_store.get_api_key("openai", "api_key") == "sk-test"


def test_invoke_daw_connection_connect_returns_connection_shape() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-3c",
            capability="daw.connection.connect",
            payload={"host": "127.0.0.1", "port": 31416},
        ),
    )

    assert response.success is True
    assert response.data == {
        "connected": True,
        "host": "127.0.0.1",
        "port": 31416,
    }


def test_invoke_daw_connection_disconnect_returns_shape() -> None:
    app = _app_with_fake_daw()
    app.state.services.daw.connected = True
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-3d",
            capability="daw.connection.disconnect",
            payload={},
        ),
    )

    assert response.success is True
    assert response.data == {"disconnected": True}
    assert app.state.services.daw.connected is False


def test_invoke_session_get_info_returns_session_payload() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-4",
            capability="session.getInfo",
            payload={},
        ),
    )

    assert response.success is True
    assert response.data == {
        "session": {
            "sessionName": "Presto",
            "sessionPath": "/Sessions/Presto.ptx",
            "sampleRate": 48000,
            "bitDepth": 32,
            "isPlaying": False,
            "isRecording": False,
        }
    }


def test_invoke_session_get_length_returns_seconds() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-4b",
            capability="session.getLength",
            payload={},
        ),
    )

    assert response.success is True
    assert response.data == {
        "seconds": 183.5,
    }


def test_invoke_track_list_returns_minimum_track_fields() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5",
            capability="track.list",
            payload={},
        ),
    )

    assert response.success is True
    assert response.data["tracks"][0] == {
        "id": "track-1",
        "name": "Kick",
        "type": "audio",
        "format": "stereo",
        "isMuted": False,
        "isSoloed": False,
        "isRecordEnabled": False,
        "color": "#ffbd520e",
        "comments": None,
    }
    assert len(response.data["tracks"]) == 4


def test_invoke_track_list_names_returns_names_only() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5b",
            capability="track.listNames",
            payload={},
        ),
    )

    assert response.success is True
    assert response.data == {
        "names": ["Kick", "Piano", "Snare", "Bass"],
    }


def test_invoke_track_select_returns_selected_shape() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5c",
            capability="track.select",
            payload={"trackName": "Snare"},
        ),
    )

    assert response.success is True
    assert response.data == {
        "selected": True,
    }
    assert app.state.services.daw.selected_tracks == ["Snare"]


def test_invoke_track_selection_get_returns_selected_track_names() -> None:
    app = _app_with_fake_daw()
    app.state.services.daw.selected_tracks = ["Snare"]
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5c-selection",
            capability="track.selection.get",
            payload={},
        ),
    )

    assert response.success is True
    assert response.data == {
        "trackNames": ["Snare"],
    }


def test_invoke_track_color_apply_returns_applied_shape() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5d",
            capability="track.color.apply",
            payload={"trackName": "Kick", "colorSlot": 7},
        ),
    )

    assert response.success is True
    assert response.data == {
        "applied": True,
        "trackName": "Kick",
        "colorSlot": 7,
    }
    assert app.state.services.daw.applied_colors == [("Kick", 7)]


def test_invoke_track_pan_set_returns_updated_shape() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5d-pan",
            capability="track.pan.set",
            payload={"trackName": "Kick", "value": 0},
        ),
    )

    assert response.success is True
    assert response.data == {
        "updated": True,
        "trackName": "Kick",
        "value": 0.0,
    }
    assert app.state.services.daw.pan_updates == [("Kick", 0.0)]


def test_invoke_strip_silence_open_runs_preflight_and_window_script() -> None:
    app = _app_with_fake_strip_silence()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5d-open",
            capability="stripSilence.open",
            payload={},
        ),
    )

    assert response.success is True
    assert response.data == {"opened": True}
    assert app.state.services.mac_automation.scripts == ["preflight", "open-strip-silence"]
    assert app.state.services.daw_ui_profile.open_script_calls == 1


def test_invoke_strip_silence_execute_runs_preflight_and_execute_script() -> None:
    app = _app_with_fake_strip_silence()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5d-execute",
            capability="stripSilence.execute",
            payload={"trackName": "Kick", "profile": {"thresholdDb": -40}},
        ),
    )

    assert response.success is True
    assert response.data == {"completed": True}
    assert app.state.services.mac_automation.scripts == ["preflight", "execute-strip-silence"]
    assert app.state.services.daw_ui_profile.execute_script_calls == 1


def test_invoke_split_stereo_to_mono_execute_runs_dedicated_automation_flow() -> None:
    app = _app_with_fake_strip_silence()
    app.state.services.daw.selected_tracks = ["Kick"]
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-automation-split",
            capability="automation.splitStereoToMono.execute",
            payload={"keepChannel": "left"},
        ),
    )

    assert response.success is True
    assert response.data == {
        "completed": True,
        "items": [
            {
                "sourceTrackName": "Kick",
                "keptTrackName": "Kick",
                "deletedTrackNames": ["Kick", "Kick.R"],
            }
        ],
    }
    assert app.state.services.daw_ui_profile.menu_click_paths == [
        ("Track", "Split into Mono"),
    ]
    assert app.state.services.mac_automation.scripts == [
        "preflight",
        "menu:Track>Split into Mono",
        "delete-selected-track",
        "set-track-pan:Kick:0.0",
    ]
    assert app.state.services.daw.renamed_tracks == [("Kick.L", "Kick")]
    assert app.state.services.daw.pan_updates == []
    assert app.state.services.daw_ui_profile.pan_reset_requests == [("Kick", 0.0)]
    assert app.state.services.daw.list_track_names() == ["Piano", "Snare", "Bass", "Kick"]


def test_invoke_split_stereo_to_mono_execute_can_keep_right_channel() -> None:
    app = _app_with_fake_strip_silence()
    app.state.services.daw.selected_tracks = ["Kick"]
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-automation-split-right",
            capability="automation.splitStereoToMono.execute",
            payload={"keepChannel": "right"},
        ),
    )

    assert response.success is True
    assert response.data == {
        "completed": True,
        "items": [
            {
                "sourceTrackName": "Kick",
                "keptTrackName": "Kick",
                "deletedTrackNames": ["Kick", "Kick.L"],
            }
        ],
    }
    assert app.state.services.daw.renamed_tracks == [("Kick.R", "Kick")]
    assert app.state.services.mac_automation.scripts == [
        "preflight",
        "menu:Track>Split into Mono",
        "delete-selected-track",
        "set-track-pan:Kick:0.0",
    ]


def test_invoke_split_stereo_to_mono_execute_rejects_non_stereo_selection() -> None:
    app = _app_with_fake_strip_silence()
    app.state.services.daw.selected_tracks = ["Snare"]
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-automation-split-mono",
            capability="automation.splitStereoToMono.execute",
            payload={"keepChannel": "left"},
        ),
    )

    assert response.success is False
    assert response.error.code == "TRACK_SELECTION_INVALID"
    assert response.error.capability == "automation.splitStereoToMono.execute"


def test_invoke_split_stereo_to_mono_execute_runs_batch_flow_for_multiple_selected_stereo_tracks() -> None:
    app = _app_with_fake_strip_silence()
    app.state.services.daw.selected_tracks = ["Kick", "Piano"]
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-automation-split-multi",
            capability="automation.splitStereoToMono.execute",
            payload={"keepChannel": "left"},
        ),
    )

    assert response.success is True
    assert response.data == {
        "completed": True,
        "items": [
            {
                "sourceTrackName": "Kick",
                "keptTrackName": "Kick",
                "deletedTrackNames": ["Kick", "Kick.R"],
            },
            {
                "sourceTrackName": "Piano",
                "keptTrackName": "Piano",
                "deletedTrackNames": ["Piano", "Piano.R"],
            },
        ],
    }
    assert app.state.services.mac_automation.scripts == [
        "preflight",
        "menu:Track>Split into Mono",
        "delete-selected-track",
        "set-track-pan:Kick:0.0",
        "set-track-pan:Piano:0.0",
    ]
    assert app.state.services.daw.renamed_tracks == [("Kick.L", "Kick"), ("Piano.L", "Piano")]
    assert app.state.services.daw.list_track_names() == ["Snare", "Bass", "Kick", "Piano"]


def test_invoke_transport_play_returns_started_shape() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5d1",
            capability="transport.play",
            payload={},
        ),
    )

    assert response.success is True
    assert response.data == {"started": True}
    assert app.state.services.daw.transport_state == "playing"


def test_invoke_transport_stop_returns_stopped_shape() -> None:
    app = _app_with_fake_daw()
    app.state.services.daw.transport_state = "playing"
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5d2",
            capability="transport.stop",
            payload={},
        ),
    )

    assert response.success is True
    assert response.data == {"stopped": True}
    assert app.state.services.daw.transport_state == "stopped"


def test_invoke_transport_record_returns_recording_shape() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5d3",
            capability="transport.record",
            payload={},
        ),
    )

    assert response.success is True
    assert response.data == {"recording": True}
    assert app.state.services.daw.transport_state == "recording"


def test_invoke_transport_get_status_returns_transport_shape() -> None:
    app = _app_with_fake_daw()
    app.state.services.daw.transport_state = "recording"
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5d4",
            capability="transport.getStatus",
            payload={},
        ),
    )

    assert response.success is True
    assert response.data == {
        "transport": {
            "state": "recording",
            "isPlaying": False,
            "isRecording": True,
        }
    }


def test_invoke_session_save_returns_saved_shape() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5e",
            capability="session.save",
            payload={},
        ),
    )

    assert response.success is True
    assert response.data == {"saved": True}
    assert app.state.services.daw.saved_sessions == 1


@pytest.mark.parametrize(("capability_id"), ["ai.key.getStatus", "ai.key.set", "import.preflight"])
def test_deleted_public_capabilities_are_not_invokable(capability_id: str) -> None:
    app = _app_with_fake_daw_and_config()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId=f"req-{capability_id}",
            capability=capability_id,
            payload={},
        ),
    )

    assert response.success is False
    assert response.error.code == "VALIDATION_ERROR"
    assert response.error.capability == capability_id
    assert response.error.details["capability_id"] == capability_id


def test_invoke_import_run_start_returns_job_for_core_io_import(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)
    source_folder = _create_audio_source_folder(tmp_path, file_names=["Kick.wav", "Snare.wav"])

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-import-run-start",
            capability="import.run.start",
            payload={"folderPaths": [str(source_folder)]},
        ),
    )

    assert response.success is True
    assert response.data["capability"] == "import.run.start"
    assert response.data["state"] == "queued"
    assert response.data["jobId"]


def test_invoke_export_range_set_returns_normalized_selection() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-export-range-set",
            capability="export.range.set",
            payload={"inTime": "00:00:01:00", "outTime": "00:00:05:00"},
        ),
    )

    assert response.success is True
    assert response.data == {
        "selection": {
            "inTime": "00:00:01:00",
            "outTime": "00:00:05:00",
        }
    }
    assert app.state.services.daw.timeline_selection_calls == [{"in_time": "00:00:01:00", "out_time": "00:00:05:00"}]


def test_invoke_export_mix_with_source_returns_source_list() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-export-mix-with-source",
            capability="export.mixWithSource",
            payload={"sourceType": "output"},
        ),
    )

    assert response.success is True
    assert response.data == {
        "sourceType": "output",
        "sourceList": ["output-1", "output-2"],
    }
    assert app.state.services.daw.export_mix_source_list_calls == ["output"]


def test_invoke_export_start_runs_export_mix_with_default_physical_output_source() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-export-start",
            capability="export.start",
            payload={
                "outputPath": "/Users/test/Exports",
                "fileName": "mix-print",
                "fileType": "WAV",
                "offline": True,
                "audio": {
                    "format": "interleaved",
                    "bitDepth": 24,
                    "sampleRate": 48000,
                },
            },
        ),
    )

    assert response.success is True
    assert response.data["capability"] == "export.start"
    assert response.data["state"] == "queued"
    assert response.data["jobId"]


def test_invoke_export_direct_start_also_routes_to_export_mix() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-export-direct-start",
            capability="export.direct.start",
            payload={
                "outputPath": "/Users/test/Exports",
                "fileName": "clip-print",
                "fileType": "WAV",
                "offline": True,
                "audio": {
                    "format": "interleaved",
                    "bitDepth": 24,
                    "sampleRate": 48000,
                },
            },
        ),
    )

    assert response.success is True
    assert response.data["capability"] == "export.direct.start"
    assert response.data["state"] == "queued"
    assert response.data["jobId"]


def test_invoke_export_run_start_returns_job_for_snapshot_batch_export() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-export-run-start",
            capability="export.run.start",
            payload={
                "snapshots": [
                    {
                        "name": "Verse A",
                        "trackStates": [
                            {"trackName": "Kick", "isMuted": True, "isSoloed": False},
                        ],
                    }
                ],
                "exportSettings": {
                    "outputPath": "/Users/test/Exports",
                    "filePrefix": "Mix_",
                    "fileFormat": "wav",
                    "mixSources": [
                        {
                            "name": "Out 1-2",
                            "type": "physicalOut",
                        }
                    ],
                    "onlineExport": False,
                },
            },
        ),
    )

    assert response.success is True
    assert response.data["capability"] == "export.run.start"
    assert response.data["state"] == "queued"
    assert response.data["jobId"]


def test_invoke_export_run_start_rejects_mp3_when_multiple_mix_sources_are_selected() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-export-run-start-mp3-multi",
            capability="export.run.start",
            payload={
                "snapshots": [
                    {
                        "name": "Verse A",
                        "trackStates": [
                            {"trackName": "Kick", "isMuted": True, "isSoloed": False},
                        ],
                    }
                ],
                "exportSettings": {
                    "outputPath": "/Users/test/Exports",
                    "filePrefix": "Mix_",
                    "fileFormat": "mp3",
                    "mixSources": [
                        {"name": "Out 1-2", "type": "physicalOut"},
                        {"name": "Bus 1-2", "type": "bus"},
                    ],
                    "onlineExport": False,
                },
            },
        ),
    )

    assert response.success is False
    assert response.error.details["field"] == "exportSettings.mixSources"


def test_invoke_jobs_create_returns_placeholder_job() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-jobs-create",
            capability="jobs.create",
            payload={
                "capability": "jobs.create",
                "targetDaw": "pro_tools",
                "state": "queued",
                "progress": {"phase": "queued", "current": 0, "total": 1},
            },
        ),
    )

    assert response.success is True
    assert response.data["job"]["capability"] == "jobs.create"
    assert response.data["job"]["state"] == "queued"
    assert response.data["job"]["jobId"]


def test_invoke_jobs_update_updates_existing_job() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)
    created = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-jobs-create-2",
            capability="jobs.create",
            payload={
                "capability": "jobs.create",
                "targetDaw": "pro_tools",
            },
        ),
    )

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-jobs-update",
            capability="jobs.update",
            payload={
                "jobId": created.data["job"]["jobId"],
                "state": "running",
                "progress": {"phase": "running", "current": 1, "total": 4},
            },
        ),
    )

    assert response.success is True
    assert response.data["job"]["state"] == "running"
    assert response.data["job"]["progress"]["percent"] == 25.0


def test_invoke_jobs_get_preserves_job_metadata() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)
    created = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-jobs-create-with-metadata",
            capability="jobs.create",
            payload={
                "capability": "jobs.create",
                "targetDaw": "pro_tools",
                "state": "running",
                "progress": {
                    "phase": "running",
                    "current": 2,
                    "total": 5,
                    "percent": 29.0,
                },
                "metadata": {
                    "currentSnapshot": 2,
                    "currentSnapshotName": "Verse A",
                    "totalSnapshots": 5,
                    "currentFileProgressPercent": 29.0,
                    "overallProgressPercent": 25.8,
                    "exportedCount": 1,
                },
            },
        ),
    )

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-jobs-get-with-metadata",
            capability="jobs.get",
            payload={
                "jobId": created.data["job"]["jobId"],
            },
        ),
    )

    assert response.success is True
    assert response.data["job"]["metadata"] == {
        "currentSnapshot": 2,
        "currentSnapshotName": "Verse A",
        "totalSnapshots": 5,
        "currentFileProgressPercent": 29.0,
        "overallProgressPercent": 25.8,
        "exportedCount": 1,
    }


def test_invoke_jobs_create_rejects_invalid_progress_numbers_with_validation_error() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-jobs-create-invalid-progress",
            capability="jobs.create",
            payload={
                "capability": "jobs.create",
                "targetDaw": "pro_tools",
                "progress": {
                    "phase": "queued",
                    "current": "bad-int",
                    "total": 1,
                },
            },
        ),
    )

    assert response.success is False
    assert response.error.code == "VALIDATION_ERROR"
    assert response.error.capability == "jobs.create"
    assert response.error.details["field"] == "progress.current"


def test_invoke_jobs_update_rejects_invalid_progress_numbers_with_validation_error() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)
    created = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-jobs-create-3",
            capability="jobs.create",
            payload={
                "capability": "jobs.create",
                "targetDaw": "pro_tools",
            },
        ),
    )

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-jobs-update-invalid-progress",
            capability="jobs.update",
            payload={
                "jobId": created.data["job"]["jobId"],
                "progress": {
                    "phase": "running",
                    "current": 1,
                    "total": 2,
                    "percent": "bad-float",
                },
            },
        ),
    )

    assert response.success is False
    assert response.error.code == "VALIDATION_ERROR"
    assert response.error.capability == "jobs.update"
    assert response.error.details["field"] == "progress.percent"


def test_invoke_session_get_snapshot_info_returns_snapshot_statistics() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)
    snapshot = {
        "name": "Verse A",
        "trackStates": [
            {"trackName": "Kick", "isMuted": False, "isSoloed": False},
            {"trackName": "Snare", "isMuted": True, "isSoloed": False},
            {"trackName": "Bass", "isMuted": False, "isSoloed": True},
        ],
    }

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5f",
            capability="session.getSnapshotInfo",
            payload={"snapshot": snapshot},
        ),
    )

    assert response.success is True
    assert response.data == {
        "snapshot": snapshot,
        "statistics": {
            "totalTracks": 3,
            "mutedTracks": 1,
            "soloedTracks": 1,
            "normalTracks": 1,
        },
    }


def test_invoke_session_apply_snapshot_returns_counts() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5g",
            capability="session.applySnapshot",
            payload={
                "snapshot": {
                    "name": "Verse A",
                    "trackStates": [
                        {"trackName": "Kick", "isMuted": True, "isSoloed": False},
                        {"trackName": "Snare", "isMuted": False, "isSoloed": True},
                    ],
                }
            },
        ),
    )

    assert response.success is True
    assert response.data == {
        "applied": True,
        "successCount": 2,
        "errorCount": 0,
        "skippedCount": 0,
    }
    assert app.state.services.daw.mute_updates == [("Kick", True)]
    assert app.state.services.daw.solo_updates == [("Snare", True)]


def test_invoke_track_rename_returns_renamed_shape() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5h",
            capability="track.rename",
            payload={"currentName": "Kick", "newName": "Kick In"},
        ),
    )

    assert response.success is True
    assert response.data == {
        "renamed": True,
        "trackName": "Kick In",
    }
    assert app.state.services.daw.renamed_tracks == [("Kick", "Kick In")]


def test_invoke_track_mute_and_solo_set_return_updated_shape() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    mute_response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5i",
            capability="track.mute.set",
            payload={"trackNames": ["Kick", "Snare"], "enabled": True},
        ),
    )
    solo_response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5j",
            capability="track.solo.set",
            payload={"trackNames": ["Bass"], "enabled": False},
        ),
    )

    assert mute_response.success is True
    assert mute_response.data == {
        "updated": True,
        "trackNames": ["Kick", "Snare"],
        "enabled": True,
    }
    assert solo_response.success is True
    assert solo_response.data == {
        "updated": True,
        "trackNames": ["Bass"],
        "enabled": False,
    }
    assert app.state.services.daw.mute_updates == [("Kick", True), ("Snare", True)]
    assert app.state.services.daw.solo_updates == [("Bass", False)]


def test_invoke_clip_select_all_on_track_returns_selected_shape() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-5k",
            capability="clip.selectAllOnTrack",
            payload={"trackName": "Kick"},
        ),
    )

    assert response.success is True
    assert response.data == {"selected": True}
    assert app.state.services.daw.selected_clip_tracks == ["Kick"]


def test_health_route_unchanged() -> None:
    app = create_app()
    request = DummyRequest(app=app)

    response = health(request)

    assert response.model_dump() == {
        "backend_ready": True,
        "daw_connected": False,
        "active_daw": "pro_tools",
    }
