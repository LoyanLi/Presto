from __future__ import annotations

import pytest

from presto.domain.errors import PrestoError
from presto.integrations.daw.ptsl_runner import PtslCommandCatalogEntry, PtslCommandRunner


class FakeClient:
    def __init__(self, *, responses: dict[int, object] | None = None, error: Exception | None = None) -> None:
        self.run_calls = []
        self.run_command_calls = []
        self._responses = dict(responses or {})
        self._error = error

    def run(self, operation) -> None:
        self.run_calls.append(operation)
        operation.response = {"mode": "op"}

    def run_command(self, command_id: int, request: dict[str, object]):
        self.run_command_calls.append((command_id, dict(request)))
        if self._error is not None:
            raise self._error
        return self._responses.get(command_id)


class FakeEngine:
    def __init__(self, *, responses: dict[int, object] | None = None, error: Exception | None = None) -> None:
        self.client = FakeClient(responses=responses, error=error)


def _runner(entries: list[PtslCommandCatalogEntry]) -> PtslCommandRunner:
    return PtslCommandRunner(entries)


def test_runner_uses_raw_run_command_for_cataloged_commands_even_when_py_ptsl_wrapper_exists() -> None:
    engine = FakeEngine(responses={73: {"ok": True}})
    runner = _runner(
        [
            PtslCommandCatalogEntry(
                command_name="CId_SelectTracksByName",
                command_id=73,
                request_message="SelectTracksByNameRequestBody",
                response_message=None,
                has_py_ptsl_op=True,
                category="track",
                introduced_version="2023.09.0",
            )
        ]
    )

    response = runner.run(
        engine,
        "CId_SelectTracksByName",
        {"track_names": ["Kick"], "selection_mode": "SM_Replace"},
        capability="track.select",
    )

    assert response == {"ok": True}
    assert engine.client.run_calls == []
    assert engine.client.run_command_calls == [(73, {"track_names": ["Kick"], "selection_mode": "SM_Replace"})]


def test_runner_normalizes_declared_response_messages_to_dicts() -> None:
    engine = FakeEngine(
        responses={
            59: {
                "current_setting": "TS_TransportRecording",
            }
        }
    )
    runner = _runner(
        [
            PtslCommandCatalogEntry(
                command_name="CId_GetTransportState",
                command_id=59,
                request_message=None,
                response_message="GetTransportStateResponseBody",
                has_py_ptsl_op=True,
                category="transport",
                introduced_version="2025.10.0",
            )
        ]
    )

    response = runner.run(engine, "CId_GetTransportState", {}, capability="transport.getStatus")

    assert response == {
        "current_setting": "TS_TransportRecording",
        "possible_settings": [],
    }
    assert engine.client.run_calls == []
    assert engine.client.run_command_calls == [(59, {})]


def test_runner_rejects_unknown_command_names() -> None:
    runner = _runner([])

    with pytest.raises(PrestoError) as exc_info:
        runner.run(FakeEngine(), "CId_DoesNotExist", {}, capability="track.list")

    assert exc_info.value.code == "PTSL_COMMAND_UNAVAILABLE"


def test_runner_rejects_unknown_request_fields() -> None:
    runner = _runner(
        [
            PtslCommandCatalogEntry(
                command_name="CId_SelectTracksByName",
                command_id=73,
                request_message="SelectTracksByNameRequestBody",
                response_message=None,
                has_py_ptsl_op=True,
                category="track",
                introduced_version="2023.09.0",
            )
        ]
    )

    with pytest.raises(PrestoError) as exc_info:
        runner.run(
            FakeEngine(),
            "CId_SelectTracksByName",
            {"track_names": ["Kick"], "selection_mode": "SM_Replace", "unknown": True},
            capability="track.select",
        )

    assert exc_info.value.code == "PTSL_REQUEST_INVALID"
    assert exc_info.value.details["command_name"] == "CId_SelectTracksByName"


def test_runner_enforces_catalog_introduced_version_by_default() -> None:
    engine = FakeEngine()
    runner = PtslCommandRunner(
        [
            PtslCommandCatalogEntry(
                command_name="CId_SetTrackRecordEnableState",
                command_id=88,
                request_message="SetTrackRecordEnableStateRequestBody",
                response_message="SetTrackRecordEnableStateResponseBody",
                has_py_ptsl_op=True,
                category="track",
                introduced_version="2025.10.0",
            )
        ],
        host_version="2025.06.0",
    )

    with pytest.raises(PrestoError) as exc_info:
        runner.run(
            engine,
            "CId_SetTrackRecordEnableState",
            {"track_names": ["Kick"], "enabled": True},
            capability="track.recordEnable.set",
        )

    assert exc_info.value.code == "PTSL_VERSION_UNSUPPORTED"


def test_runner_allows_call_site_to_strengthen_minimum_host_version() -> None:
    engine = FakeEngine()
    runner = PtslCommandRunner(
        [
            PtslCommandCatalogEntry(
                command_name="CId_SetTrackRecordEnableState",
                command_id=88,
                request_message="SetTrackRecordEnableStateRequestBody",
                response_message="SetTrackRecordEnableStateResponseBody",
                has_py_ptsl_op=True,
                category="track",
                introduced_version="2025.06.0",
            )
        ],
        host_version="2025.06.0",
    )

    with pytest.raises(PrestoError) as exc_info:
        runner.run(
            engine,
            "CId_SetTrackRecordEnableState",
            {"track_names": ["Kick"], "enabled": True},
            capability="track.recordEnable.set",
            minimum_host_version="2025.10.0",
        )

    assert exc_info.value.code == "PTSL_VERSION_UNSUPPORTED"


def test_runner_normalizes_get_track_list_empty_object_response() -> None:
    engine = FakeEngine(
        responses={
            3: {
                "track_list": {},
            }
        }
    )
    runner = _runner(
        [
            PtslCommandCatalogEntry(
                command_name="CId_GetTrackList",
                command_id=3,
                request_message="GetTrackListRequestBody",
                response_message="GetTrackListResponseBody",
                has_py_ptsl_op=True,
                category="session_read",
                introduced_version="2022.12.0",
            )
        ]
    )

    response = runner.run(
        engine,
        "CId_GetTrackList",
        {"page_limit": 1000, "pagination_request": {"limit": 1000, "offset": 0}},
        capability="track.list",
    )

    assert response == {"track_list": []}


def test_runner_ignores_unknown_response_fields_while_preserving_declared_track_list_shape() -> None:
    engine = FakeEngine(
        responses={
            3: {
                "track_list": [
                    {
                        "id": "1",
                        "name": "Kick",
                        "type": "TT_Audio",
                        "format": "TF_Stereo",
                        "height": 56,
                        "track_attributes": {
                            "is_muted": False,
                            "is_soloed": False,
                            "is_selected": "TAState_None",
                        },
                    }
                ],
                "pagination_response": {
                    "limit": 1000,
                    "offset": 0,
                    "total": 1,
                },
            }
        }
    )
    runner = _runner(
        [
            PtslCommandCatalogEntry(
                command_name="CId_GetTrackList",
                command_id=3,
                request_message="GetTrackListRequestBody",
                response_message="GetTrackListResponseBody",
                has_py_ptsl_op=True,
                category="session_read",
                introduced_version="2022.12.0",
            )
        ]
    )

    response = runner.run(
        engine,
        "CId_GetTrackList",
        {"page_limit": 1000, "pagination_request": {"limit": 1000, "offset": 0}},
        capability="track.list",
    )

    assert response["track_list"] == [
        {
            "name": "Kick",
            "type": "AudioTrack",
            "id": "1",
            "index": 0,
            "color": "",
            "track_attributes": {
                "is_inactive": "TAState_Unknown",
                "is_hidden": "TAState_Unknown",
                "is_selected": "None",
                "contains_clips": False,
                "contains_automation": False,
                "is_soloed": False,
                "is_record_enabled": False,
                "is_input_monitoring_on": "TAState_Unknown",
                "is_smart_dsp_on": False,
                "is_locked": False,
                "is_muted": False,
                "is_frozen": False,
                "is_open": False,
                "is_online": False,
                "is_record_enabled_safe": False,
                "is_smart_dsp_on_safe": False,
                "is_soloed_safe": False,
                "has_edit_selection": "TAState_Unknown",
            },
            "id_compressed": "",
            "format": "TF_Stereo",
            "timebase": "TTB_Unknown",
            "parent_folder_name": "",
            "parent_folder_id": "",
        }
    ]


def test_runner_normalizes_get_playback_mode_string_enums() -> None:
    engine = FakeEngine(
        responses={
            66: {
                "current_settings": ["PM_Normal"],
                "possible_settings": ["PM_Normal", "PM_Loop"],
            }
        }
    )
    runner = _runner(
        [
            PtslCommandCatalogEntry(
                command_name="CId_GetPlaybackMode",
                command_id=66,
                request_message=None,
                response_message="GetPlaybackModeResponseBody",
                has_py_ptsl_op=True,
                category="transport",
                introduced_version="2022.12.0",
            )
        ]
    )

    response = runner.run(engine, "CId_GetPlaybackMode", {}, capability="transport.getStatus")

    assert response == {
        "current_settings": ["PM_Normal"],
        "possible_settings": ["PM_Normal", "PM_Loop"],
    }


def test_runner_normalizes_get_session_interleaved_state_possible_settings() -> None:
    engine = FakeEngine(
        responses={
            96: {
                "current_setting": True,
                "possible_settings": ["True", "False"],
            }
        }
    )
    runner = _runner(
        [
            PtslCommandCatalogEntry(
                command_name="CId_GetSessionInterleavedState",
                command_id=96,
                request_message=None,
                response_message="GetSessionInterleavedStateResponseBody",
                has_py_ptsl_op=True,
                category="session_read",
                introduced_version="2023.09.0",
            )
        ]
    )

    response = runner.run(engine, "CId_GetSessionInterleavedState", {}, capability="session.get")

    assert response == {
        "current_setting": True,
        "possible_settings": [True, False],
    }


def test_runner_rejects_invalid_declared_response_shapes() -> None:
    engine = FakeEngine(
        responses={
            128: {
                "source_list": "not-a-list",
            }
        }
    )
    runner = _runner(
        [
            PtslCommandCatalogEntry(
                command_name="CId_GetExportMixSourceList",
                command_id=128,
                request_message="GetExportMixSourceListRequestBody",
                response_message="GetExportMixSourceListResponseBody",
                has_py_ptsl_op=False,
                category="export",
                introduced_version="2025.10.0",
            )
        ]
    )

    with pytest.raises(PrestoError) as exc_info:
        runner.run(engine, "CId_GetExportMixSourceList", {"type": "EMSType_Output"}, capability="export.mixWithSource")

    assert exc_info.value.code == "PTSL_RESPONSE_INVALID"


def test_runner_omits_serializer_injected_mutually_exclusive_empty_fields_from_request_payload() -> None:
    engine = FakeEngine(responses={106: {"success_count": 1}})
    runner = _runner(
        [
            PtslCommandCatalogEntry(
                command_name="CId_SetTrackColor",
                command_id=106,
                request_message="SetTrackColorRequestBody",
                response_message="SetTrackColorResponseBody",
                has_py_ptsl_op=True,
                category="track",
                introduced_version="2022.12.0",
            )
        ]
    )

    response = runner.run(
        engine,
        "CId_SetTrackColor",
        {"track_names": ["Kick"], "color_index": 5},
        capability="track.color.apply",
    )

    assert response == {"success_count": 1}
    assert engine.client.run_command_calls == [
        (
            106,
            {"track_names": ["Kick"], "color_index": 5},
        )
    ]


def test_runner_preserves_explicit_default_like_request_values_supplied_by_caller() -> None:
    engine = FakeEngine(responses={88: {"success_count": 1}})
    runner = _runner(
        [
            PtslCommandCatalogEntry(
                command_name="CId_SetTrackRecordEnableState",
                command_id=88,
                request_message="SetTrackRecordEnableStateRequestBody",
                response_message=None,
                has_py_ptsl_op=True,
                category="track",
                introduced_version="2022.12.0",
            )
        ]
    )

    response = runner.run(
        engine,
        "CId_SetTrackRecordEnableState",
        {"track_names": ["Kick"], "enabled": False},
        capability="track.recordEnable.set",
    )

    assert response == {"success_count": 1}
    assert engine.client.run_command_calls == [
        (
            88,
            {"track_names": ["Kick"], "enabled": False},
        )
    ]
