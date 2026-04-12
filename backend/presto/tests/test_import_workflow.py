from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

from presto.application.capabilities.registry import build_default_capability_registry
from presto.application.errors.normalizer import ErrorNormalizer
from presto.application.handlers.import_workflow import (
    ImportAnalysisCache,
    _update_export_run_progress,
    analyze_import,
    finalize_import,
    persist_import_analysis_cache,
    start_export_run,
    start_import_run,
)
from presto.application.jobs.manager import InMemoryJobManager
from presto.application.service_container import ServiceContainer, build_service_container
from presto.domain.errors import PrestoError, PrestoValidationError
from presto.domain.jobs import JobProgress, JobRecord, JobsCreateRequest
from presto.main_api import create_app
from presto.transport.http.routes.invoke import invoke_capability
from presto.transport.http.schemas.capabilities import CapabilityInvokeRequestSchema


class DummyRequest(SimpleNamespace):
    app: object


class FakeDawAdapter:
    def __init__(self) -> None:
        self.connected = True
        self.connect_calls: list[dict[str, object | None]] = []
        self.import_calls: list[list[str]] = []
        self.import_file_calls: list[str] = []
        self.import_error: PrestoError | None = None
        self.delay_seconds = 0.0
        self.started_event = threading.Event()
        self.release_event = threading.Event()
        self.block_until_released = False
        self.block_after_import_count: int | None = None
        self.export_mix_calls: list[dict[str, object]] = []
        self.export_mix_with_progress_calls: list[dict[str, object]] = []
        self.export_started_event = threading.Event()
        self.export_release_event = threading.Event()
        self.export_block_until_released = False
        self.export_cancel_calls = 0
        self.export_cancel_requested = False
        self.export_fail_name_fragments: set[str] = set()
        self.export_write_delay_seconds = 0.0
        self.export_progress_updates: list[int] = [20, 55, 100]
        self.export_progress_started_event = threading.Event()
        self.export_progress_release_event = threading.Event()
        self.export_progress_block_after_first_update = False
        self.export_progress_block_on_call_index: int | None = 1
        self.timeline_selection_calls: list[dict[str, object]] = []
        self.session_path = "/tmp/Presto Session.ptx"
        self.track_states: dict[str, dict[str, object]] = {
            "Kick": {"track_id": "track-1", "track_name": "Kick", "is_muted": False, "is_soloed": False},
            "Snare": {"track_id": "track-2", "track_name": "Snare", "is_muted": False, "is_soloed": False},
            "Bass": {"track_id": "track-3", "track_name": "Bass", "is_muted": False, "is_soloed": False},
        }
        self.mute_updates: list[tuple[str, bool]] = []
        self.solo_updates: list[tuple[str, bool]] = []

    def is_connected(self) -> bool:
        return self.connected

    def connect(self, host: str | None = None, port: int | None = None, timeout_seconds: int | None = None) -> bool:
        self.connect_calls.append(
            {
                "host": host,
                "port": port,
                "timeoutSeconds": timeout_seconds,
            }
        )
        self.connected = True
        return True

    def import_audio_files(self, paths: list[str]) -> list[str]:
        self.import_calls.append(list(paths))
        self.started_event.set()
        if self.block_until_released:
            self.release_event.wait(timeout=5)
        if self.delay_seconds > 0:
            time.sleep(self.delay_seconds)
        if self.import_error is not None:
            raise self.import_error
        return [f"imported:{path}" for path in paths]

    def import_audio_file(self, path: str) -> str:
        self.import_file_calls.append(path)
        self.started_event.set()
        if self.block_until_released:
            self.release_event.wait(timeout=5)
        if self.delay_seconds > 0:
            time.sleep(self.delay_seconds)
        if self.import_error is not None:
            raise self.import_error
        if self.block_after_import_count is not None and len(self.import_file_calls) > self.block_after_import_count:
            self.release_event.wait(timeout=5)
        return f"imported:{path}"

    def get_session_info(self) -> SimpleNamespace:
        return SimpleNamespace(
            session_name=Path(self.session_path).stem,
            session_path=self.session_path,
            sample_rate=48000,
            bit_depth=24,
            is_playing=False,
            is_recording=False,
        )

    def set_timeline_selection(self, **kwargs) -> tuple[str, str]:
        self.timeline_selection_calls.append(dict(kwargs))
        return (str(kwargs.get("in_time", "")), str(kwargs.get("out_time", "")))

    def list_tracks(self) -> list[SimpleNamespace]:
        return [SimpleNamespace(**track_state) for track_state in self.track_states.values()]

    def set_track_mute_state(self, track_name: str, muted: bool) -> None:
        self.mute_updates.append((track_name, muted))
        if track_name in self.track_states:
            self.track_states[track_name]["is_muted"] = muted

    def set_track_solo_state(self, track_name: str, soloed: bool) -> None:
        self.solo_updates.append((track_name, soloed))
        if track_name in self.track_states:
            self.track_states[track_name]["is_soloed"] = soloed

    def export_mix(self, **kwargs) -> None:
        self.export_mix_calls.append(dict(kwargs))
        self.export_started_event.set()
        if self.export_block_until_released:
            self.export_release_event.wait(timeout=5)
        if self.export_cancel_requested:
            return
        file_name = str(kwargs.get("file_name", ""))
        if any(fragment in file_name for fragment in self.export_fail_name_fragments):
            raise RuntimeError(f"export failed for {file_name}")
        file_type = str(kwargs.get("file_type", "wav")).lower()
        if str(kwargs.get("file_destination", "")).strip().lower() == "session_folder":
            output_file = Path(str(kwargs.get("output_path", "")))
            output_file.parent.mkdir(parents=True, exist_ok=True)
        else:
            output_dir = Path(str(kwargs.get("output_path", "")))
            output_dir.mkdir(parents=True, exist_ok=True)
            output_file = output_dir / f"{file_name}.{file_type}"
        if self.export_write_delay_seconds > 0:
            def write_later() -> None:
                time.sleep(self.export_write_delay_seconds)
                output_file.write_bytes(b"RIFF")

            threading.Thread(target=write_later, daemon=True).start()
            return
        output_file.write_bytes(b"RIFF")

    def export_mix_with_progress(self, **kwargs) -> None:
        self.export_mix_with_progress_calls.append(dict(kwargs))
        self.export_progress_started_event.set()
        progress_callback = kwargs.get("on_progress")
        assert callable(progress_callback)
        current_call_index = len(self.export_mix_with_progress_calls)
        for progress_index, progress_value in enumerate(self.export_progress_updates):
            progress_callback(
                {
                    "taskId": f"task-{len(self.export_mix_with_progress_calls)}",
                    "status": "running" if progress_value < 100 else "completed",
                    "progressPercent": float(progress_value),
                }
            )
            if (
                progress_index == 0
                and self.export_progress_block_after_first_update
                and (self.export_progress_block_on_call_index is None or current_call_index == self.export_progress_block_on_call_index)
            ):
                self.export_progress_release_event.wait(timeout=5)
        export_kwargs = dict(kwargs)
        export_kwargs.pop("on_progress", None)
        self.export_mix(**export_kwargs)

    def cancel_export(self) -> None:
        self.export_cancel_calls += 1
        self.export_cancel_requested = True
        self.export_release_event.set()


def _app_without_daw() -> object:
    app = create_app()
    services = build_service_container(job_manager=InMemoryJobManager())
    services.daw = None
    app.state.services = services
    return app


def _app_with_fake_daw() -> object:
    app = create_app()
    services = ServiceContainer(
        capability_registry=build_default_capability_registry(),
        job_manager=InMemoryJobManager(),
        error_normalizer=ErrorNormalizer(),
        daw=FakeDawAdapter(),
    )
    app.state.services = services
    return app


def test_service_container_exposes_explicit_runtime_services_instead_of_import_cache_state() -> None:
    services = build_service_container()

    assert hasattr(services, "import_analysis_store") is True
    assert hasattr(services, "job_handle_registry") is True
    assert hasattr(services, "import_analysis_cache") is False


def _create_audio_source_folder(tmp_path: Path, *, file_names: list[str]) -> Path:
    root = tmp_path / "source"
    root.mkdir(parents=True, exist_ok=True)
    for file_name in file_names:
        (root / file_name).write_bytes(b"RIFF")
    return root


def _build_export_run_payload(output_path: Path, *, snapshots: list[dict[str, object]]) -> dict[str, object]:
    return {
        "snapshots": snapshots,
        "exportSettings": {
            "outputPath": str(output_path),
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
    }


def _build_mix_source(name: str, source_type: str = "physicalOut") -> dict[str, str]:
    return {
        "name": name,
        "type": source_type,
    }


def _seed_running_job(app: object, *, job_id: str) -> None:
    services = app.state.services
    services.job_manager.upsert(
        JobRecord(
            job_id=job_id,
            capability="daw.import.run.start",
            target_daw="pro_tools",
            state="running",
            progress=JobProgress(phase="running", current=1, total=3, percent=33.3, message="Importing"),
            result={
                "folderPaths": ["/Volumes/Samples"],
                "orderedFilePaths": ["/Volumes/Samples/kick.wav"],
            },
            created_at="2026-03-21T00:00:00",
            started_at="2026-03-21T00:00:01",
        )
    )


def _wait_for_job_state(app: object, job_id: str, expected: str, timeout_seconds: float = 5.0) -> JobRecord:
    started_at = time.monotonic()
    while time.monotonic() - started_at < timeout_seconds:
        job = app.state.services.job_manager.get(job_id)
        if job.state == expected:
            return job
        time.sleep(0.05)
    raise AssertionError(f"job {job_id} did not reach {expected}")


def test_import_analyze_scans_source_folders_recursively_and_reuses_cache(tmp_path: Path) -> None:
    root = tmp_path / "import-src"
    nested = root / "Drums"
    nested.mkdir(parents=True)
    (nested / "kick.wav").write_bytes(b"RIFF")
    (nested / "ignore.txt").write_text("not audio")

    app = _app_without_daw()
    first = analyze_import(app.state.services, {"sourceFolders": [str(root)]})
    second = analyze_import(app.state.services, {"sourceFolders": [str(root)]})

    assert first == second
    assert first == {
        "folderPaths": [str(root.resolve())],
        "orderedFilePaths": [str((nested / "kick.wav").resolve())],
        "rows": [
            {
                "filePath": str(nested / "kick.wav"),
                "categoryId": "drums",
                "aiName": "Kick",
                "finalName": "Kick",
                "status": "ready",
                "errorMessage": None,
            }
        ],
        "cache": {"files": 0, "hits": 0},
    }


def test_export_run_start_rejects_mp3_with_multiple_mix_sources(tmp_path: Path) -> None:
    app = _app_with_fake_daw()

    with pytest.raises(PrestoValidationError) as exc_info:
        start_export_run(
            app.state.services,
            {
                "snapshots": [
                    {
                        "name": "Verse A",
                        "trackStates": [{"trackName": "Kick", "isMuted": False, "isSoloed": True}],
                    }
                ],
                "exportSettings": {
                    "outputPath": str(tmp_path / "Exports"),
                    "filePrefix": "Mix_",
                    "fileFormat": "mp3",
                    "mixSources": [
                        {"name": "Out 1-2", "type": "physicalOut"},
                        {"name": "Bus 1-2", "type": "bus"},
                    ],
                    "onlineExport": False,
                },
            },
            capability_id="daw.export.run.start",
        )

    assert exc_info.value.details["field"] == "exportSettings.mixSources"


def test_import_analyze_rejects_items_payload_without_source_folders() -> None:
    app = _app_without_daw()
    try:
        analyze_import(
            app.state.services,
            {
                "items": [
                    {
                        "filePath": "/tmp/source/kick.wav",
                        "categoryId": "Drums",
                    }
                ]
            },
        )
        raise AssertionError("expected validation error")
    except Exception as exc:
        assert getattr(exc, "code", None) == "VALIDATION_ERROR"
        assert str(exc) == "sourceFolders is required."


def test_import_analyze_reads_cached_rows(tmp_path: Path) -> None:
    root = tmp_path / "import-cache"
    root.mkdir(parents=True)
    audio_path = root / "kick.wav"
    audio_path.write_bytes(b"RIFF")
    cache_payload = {
        "version": 1,
        "generated_at": "2026-03-30T12:00:00Z",
        "folder": str(root),
        "total": 1,
        "proposals": [
            {
                "file_path": str(audio_path),
                "category_id": "drums",
                "ai_name": "Kick AI",
                "final_name": "Kick Final",
                "status": "ready",
                "error_message": None,
                "relative_path": "kick.wav",
            }
        ],
    }
    (root / ".presto_ai_analyze.json").write_text(json.dumps(cache_payload))

    app = _app_without_daw()
    response = analyze_import(
        app.state.services,
        {
            "sourceFolders": [str(root)],
            "categories": [{"id": "drums", "name": "Drums"}],
            "analyzeCacheEnabled": True,
        },
    )

    assert response["cache"] == {"files": 1, "hits": 1}
    assert response["rows"] == [
        {
            "filePath": str(audio_path.resolve()),
            "categoryId": "drums",
            "aiName": "Kick AI",
            "finalName": "Kick Final",
            "status": "ready",
            "errorMessage": None,
        }
    ]


def test_import_analyze_persists_cache_payload(tmp_path: Path) -> None:
    root = tmp_path / "import-persist"
    root.mkdir(parents=True)
    audio_path = root / "snare.wav"
    audio_path.write_bytes(b"RIFF")
    app = _app_without_daw()

    response = persist_import_analysis_cache(
        app.state.services,
        {
            "sourceFolders": [str(root)],
            "rows": [
                {
                    "filePath": str(audio_path),
                    "categoryId": "drums",
                    "aiName": "Snare AI",
                    "finalName": "Snare Final",
                    "status": "ready",
                    "errorMessage": None,
                }
            ],
        },
    )

    assert response == {"saved": True, "cacheFiles": 1}
    cache_path = root / ".presto_ai_analyze.json"
    persisted = json.loads(cache_path.read_text())
    assert persisted["folder"] == str(root)
    assert persisted["total"] == 1
    assert persisted["proposals"][0]["relative_path"] == "snare.wav"


def test_import_finalize_resolves_manual_names_without_daw() -> None:
    app = _app_without_daw()
    response = finalize_import(
        app.state.services,
        {
            "proposals": [
                {
                    "filePath": "/Volumes/Samples/kick.wav",
                    "categoryId": "drums",
                    "originalStem": "kick",
                    "aiName": "Kick",
                    "finalName": "Kick",
                    "status": "ready",
                }
            ],
            "manualNameByPath": {"/Volumes/Samples/kick.wav": "Kick In"},
        },
    )

    assert response == {
        "proposals": [
            {
                "filePath": "/Volumes/Samples/kick.wav",
                "categoryId": "drums",
                "originalStem": "kick",
                "aiName": "Kick",
                "finalName": "Kick In",
                "status": "ready",
                "errorMessage": None,
            }
        ],
        "resolvedItems": [
            {
                "filePath": "/Volumes/Samples/kick.wav",
                "categoryId": "drums",
                "targetTrackName": "Kick In",
            }
        ],
    }


def test_import_run_start_executes_resolved_items_and_marks_job_succeeded(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    source_folder = _create_audio_source_folder(tmp_path, file_names=["kick.wav", "snare.wav"])
    kick_path = str((source_folder / "kick.wav").resolve())
    snare_path = str((source_folder / "snare.wav").resolve())
    response = start_import_run(
        app.state.services,
        {"folderPaths": [str(source_folder)]},
    )

    assert response["jobId"]
    job = _wait_for_job_state(app, response["jobId"], "succeeded")
    assert app.state.services.daw.import_file_calls == [kick_path, snare_path]
    assert job.state == "succeeded"
    assert job.progress.phase == "succeeded"
    assert job.started_at is not None
    assert job.finished_at is not None
    assert job.result == {
        "folderPaths": [str(source_folder.resolve())],
        "orderedFilePaths": [kick_path, snare_path],
        "importedTrackNames": [f"imported:{kick_path}", f"imported:{snare_path}"],
        "successCount": 2,
        "failedCount": 0,
    }


def test_import_run_start_does_not_attach_handle_maps_to_service_container(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    source_folder = _create_audio_source_folder(tmp_path, file_names=["kick.wav"])

    response = start_import_run(
        app.state.services,
        {"folderPaths": [str(source_folder)]},
    )

    assert response["jobId"]
    assert hasattr(app.state.services, "job_run_handles") is False
    assert hasattr(app.state.services, "job_run_handles_lock") is False


def test_import_run_start_connects_daw_before_background_import(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    app.state.services.daw.connected = False
    source_folder = _create_audio_source_folder(tmp_path, file_names=["kick.wav", "snare.wav"])
    kick_path = str((source_folder / "kick.wav").resolve())
    snare_path = str((source_folder / "snare.wav").resolve())
    response = start_import_run(
        app.state.services,
        {"folderPaths": [str(source_folder)]},
    )

    assert response["jobId"]
    job = _wait_for_job_state(app, response["jobId"], "succeeded")
    assert app.state.services.daw.connect_calls == [
        {
            "host": None,
            "port": None,
            "timeoutSeconds": None,
        }
    ]
    assert app.state.services.daw.import_file_calls == [kick_path, snare_path]
    assert job.state == "succeeded"


def test_import_run_start_respects_ordered_file_paths_from_workflow(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    source_folder = _create_audio_source_folder(tmp_path, file_names=["kick.wav", "snare.wav"])
    kick_path = str((source_folder / "kick.wav").resolve())
    snare_path = str((source_folder / "snare.wav").resolve())

    response = start_import_run(
        app.state.services,
        {
            "folderPaths": [str(source_folder)],
            "orderedFilePaths": [snare_path, kick_path],
        },
    )

    assert response["jobId"]
    job = _wait_for_job_state(app, response["jobId"], "succeeded")
    assert app.state.services.daw.import_file_calls == [snare_path, kick_path]
    assert job.result["orderedFilePaths"] == [snare_path, kick_path]


def test_import_run_start_updates_progress_after_each_imported_file(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    app.state.services.daw.block_after_import_count = 1
    source_folder = _create_audio_source_folder(tmp_path, file_names=["kick.wav", "snare.wav"])
    kick_path = str((source_folder / "kick.wav").resolve())
    snare_path = str((source_folder / "snare.wav").resolve())

    response = start_import_run(
        app.state.services,
        {"folderPaths": [str(source_folder)]},
    )

    assert response["jobId"]
    started_at = time.monotonic()
    while time.monotonic() - started_at < 2.0:
        job = app.state.services.job_manager.get(response["jobId"])
        if job.progress.current == 1:
            break
        time.sleep(0.02)
    else:
        raise AssertionError("job progress did not advance after first imported file")

    job = app.state.services.job_manager.get(response["jobId"])
    assert job.state == "running"
    assert job.progress.phase == "running"
    assert job.progress.current == 1
    assert job.progress.total == 2
    assert job.progress.percent == 50.0
    assert job.progress.message == "Imported 1 of 2 file(s)."
    assert app.state.services.daw.import_file_calls[0] == kick_path

    app.state.services.daw.release_event.set()
    completed_job = _wait_for_job_state(app, response["jobId"], "succeeded")
    assert app.state.services.daw.import_file_calls == [kick_path, snare_path]
    assert completed_job.progress.percent == 100.0


def test_import_run_start_rejects_ordered_paths_outside_folder_paths(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    source_folder = _create_audio_source_folder(tmp_path, file_names=["kick.wav"])
    rogue_folder = tmp_path / "rogue"
    rogue_folder.mkdir(parents=True)
    rogue_path = rogue_folder / "rogue.wav"
    rogue_path.write_bytes(b"RIFF")

    with pytest.raises(PrestoValidationError) as exc_info:
        start_import_run(
            app.state.services,
            {
                "folderPaths": [str(source_folder)],
                "orderedFilePaths": [str(rogue_path)],
            },
        )

    assert exc_info.value.message == f"orderedFilePaths must stay inside folderPaths: {rogue_path.resolve()}"
    assert exc_info.value.details["field"] == "orderedFilePaths"


def test_export_start_creates_job_and_marks_job_succeeded(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    output_path = tmp_path / "exports"
    response = start_export_run(
        app.state.services,
        {
            "outputPath": str(output_path),
            "fileName": "mix-print",
            "fileType": "WAV",
            "offline": True,
            "audio": {
                "format": "interleaved",
                "bitDepth": 24,
                "sampleRate": 48000,
            },
        },
        capability_id="daw.export.start",
    )

    assert response["jobId"]
    assert response["capability"] == "daw.export.start"
    assert response["state"] == "queued"
    job = _wait_for_job_state(app, response["jobId"], "succeeded")
    assert app.state.services.daw.export_mix_calls == [
        {
            "output_path": str(output_path),
            "file_name": "mix-print",
            "file_type": "WAV",
            "source_type": "physical_out",
            "source_name": "Out 1-2",
            "offline": True,
            "audio_format": "interleaved",
            "bit_depth": 24,
            "sample_rate": 48000,
            "include_video": False,
            "import_after_bounce": False,
        }
    ]
    assert job.state == "succeeded"
    assert job.progress.phase == "succeeded"
    assert job.result == {
        "outputPath": str(output_path),
        "fileName": "mix-print",
        "fileType": "WAV",
        "source": {"type": "physical_out", "name": "Out 1-2"},
        "offline": True,
        "audio": {
            "format": "interleaved",
            "bitDepth": 24,
            "sampleRate": 48000,
        },
    }


def test_export_run_start_processes_snapshots_and_moves_files_to_output_path(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    session_root = tmp_path / "session"
    session_root.mkdir(parents=True)
    app.state.services.daw.session_path = str(session_root / "Demo Session.ptx")
    output_path = tmp_path / "exports"
    payload = _build_export_run_payload(
        output_path,
        snapshots=[
            {
                "name": "Verse A",
                "trackStates": [
                    {"trackName": "Kick", "isMuted": True, "isSoloed": False},
                    {"trackName": "Snare", "isMuted": False, "isSoloed": True},
                ],
            },
            {
                "name": "Chorus",
                "trackStates": [
                    {"trackName": "Kick", "isMuted": False, "isSoloed": False},
                    {"trackName": "Snare", "isMuted": False, "isSoloed": False},
                ],
            },
        ],
    )

    response = start_export_run(app.state.services, payload, capability_id="daw.export.run.start")

    assert response["jobId"]
    assert response["capability"] == "daw.export.run.start"
    job = _wait_for_job_state(app, response["jobId"], "succeeded")

    assert len(app.state.services.daw.export_mix_calls) == 2
    assert {Path(call["output_path"]) for call in app.state.services.daw.export_mix_calls} == {output_path}
    assert all(str(call["file_name"]).startswith("temp_export_") for call in app.state.services.daw.export_mix_calls)
    assert {call["file_destination"] for call in app.state.services.daw.export_mix_calls} == {"directory"}
    assert job.progress.phase == "succeeded"
    assert job.progress.current == 2
    assert job.progress.total == 2
    assert job.metadata == {
        "currentSnapshot": 2,
        "currentSnapshotName": "Chorus",
        "totalSnapshots": 2,
        "currentMixSourceName": "Out 1-2",
        "currentMixSourceIndex": 1,
        "totalMixSources": 1,
        "currentFileProgressPercent": 100.0,
        "overallProgressPercent": 100.0,
        "etaSeconds": 0,
        "lastExportedFile": str(output_path / "Mix_Chorus.wav"),
        "exportedCount": 2,
    }
    assert job.result == {
        "status": "completed",
        "success": True,
        "exportedFiles": [
            str(output_path / "Mix_Verse A.wav"),
            str(output_path / "Mix_Chorus.wav"),
        ],
        "failedSnapshots": [],
        "failedSnapshotDetails": [],
        "totalDuration": job.result["totalDuration"],
        "errorMessage": None,
    }
    assert (output_path / "Mix_Verse A.wav").is_file()
    assert (output_path / "Mix_Chorus.wav").is_file()
    assert sorted(path.name for path in output_path.glob("temp_export_*.wav")) == []
    assert ("Kick", True) in app.state.services.daw.mute_updates
    assert ("Kick", False) in app.state.services.daw.mute_updates
    assert ("Snare", True) in app.state.services.daw.solo_updates
    assert ("Snare", False) in app.state.services.daw.solo_updates


def test_export_run_start_uses_file_level_progress_for_running_job_state(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    session_root = tmp_path / "session"
    session_root.mkdir(parents=True)
    app.state.services.daw.session_path = str(session_root / "Demo Session.ptx")
    app.state.services.daw.export_progress_updates = [25, 100]
    app.state.services.daw.export_progress_block_after_first_update = True
    app.state.services.daw.export_progress_block_on_call_index = 1
    output_path = tmp_path / "exports"
    payload = {
        "snapshots": [
            {
                "name": "Verse A",
                "trackStates": [
                    {"trackName": "Kick", "isMuted": True, "isSoloed": False},
                ],
            }
        ],
        "exportSettings": {
            "outputPath": str(output_path),
            "filePrefix": "Mix_",
            "fileFormat": "wav",
            "mixSources": [
                _build_mix_source("Out 1-2"),
                _build_mix_source("Bus Print", "bus"),
            ],
            "onlineExport": False,
        },
    }

    response = start_export_run(app.state.services, payload, capability_id="daw.export.run.start")

    assert response["jobId"]
    assert app.state.services.daw.export_progress_started_event.wait(timeout=2)
    running_job = app.state.services.job_manager.get(response["jobId"])
    assert running_job.state == "running"
    assert running_job.metadata["currentSnapshot"] == 1
    assert running_job.metadata["currentSnapshotName"] == "Verse A"
    assert running_job.metadata["currentMixSourceName"] == "Out 1-2"
    assert running_job.metadata["currentMixSourceIndex"] == 1
    assert running_job.metadata["totalMixSources"] == 2
    assert running_job.metadata["currentFileProgressPercent"] == 25.0
    assert running_job.metadata["overallProgressPercent"] == 12.5
    assert running_job.progress.percent == 12.5
    app.state.services.daw.export_progress_release_event.set()
    job = _wait_for_job_state(app, response["jobId"], "succeeded")
    assert job.result["status"] == "completed"


def test_export_run_start_records_mix_source_progress_metadata_on_success(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    session_root = tmp_path / "session"
    session_root.mkdir(parents=True)
    app.state.services.daw.session_path = str(session_root / "Demo Session.ptx")
    output_path = tmp_path / "exports"
    payload = {
        "snapshots": [
            {
                "name": "Verse A",
                "trackStates": [
                    {"trackName": "Kick", "isMuted": True, "isSoloed": False},
                ],
            }
        ],
        "exportSettings": {
            "outputPath": str(output_path),
            "filePrefix": "Mix_",
            "fileFormat": "wav",
            "mixSources": [
                _build_mix_source("Out 1-2"),
                _build_mix_source("Bus Print", "bus"),
            ],
            "onlineExport": False,
        },
    }

    response = start_export_run(app.state.services, payload, capability_id="daw.export.run.start")

    assert response["jobId"]
    job = _wait_for_job_state(app, response["jobId"], "succeeded")
    assert len(app.state.services.daw.export_mix_with_progress_calls) == 2
    assert len(job.result["exportedFiles"]) == 2
    assert job.metadata == {
        "currentSnapshot": 1,
        "currentSnapshotName": "Verse A",
        "totalSnapshots": 1,
        "currentMixSourceName": "Bus Print",
        "currentMixSourceIndex": 2,
        "totalMixSources": 2,
        "currentFileProgressPercent": 100.0,
        "overallProgressPercent": 100.0,
        "etaSeconds": 0,
        "lastExportedFile": str(output_path / "Mix_Verse A_Bus Print.wav"),
        "exportedCount": 2,
    }


def test_export_run_start_keeps_overall_progress_monotonic_after_failed_file(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    session_root = tmp_path / "session"
    session_root.mkdir(parents=True)
    app.state.services.daw.session_path = str(session_root / "Demo Session.ptx")
    app.state.services.daw.export_progress_updates = [25, 100]
    app.state.services.daw.export_progress_block_after_first_update = True
    app.state.services.daw.export_progress_block_on_call_index = 2
    app.state.services.daw.export_fail_name_fragments.add("Out 1-2")
    output_path = tmp_path / "exports"
    payload = {
        "snapshots": [
            {
                "name": "Verse A",
                "trackStates": [
                    {"trackName": "Kick", "isMuted": True, "isSoloed": False},
                ],
            }
        ],
        "exportSettings": {
            "outputPath": str(output_path),
            "filePrefix": "Mix_",
            "fileFormat": "wav",
            "mixSources": [
                _build_mix_source("Out 1-2"),
                _build_mix_source("Bus Print", "bus"),
            ],
            "onlineExport": False,
        },
    }

    response = start_export_run(app.state.services, payload, capability_id="daw.export.run.start")

    assert response["jobId"]
    assert app.state.services.daw.export_progress_started_event.wait(timeout=2)
    running_job = app.state.services.job_manager.get(response["jobId"])
    assert running_job.state == "running"
    assert running_job.metadata["currentMixSourceName"] == "Bus Print"
    assert running_job.metadata["currentMixSourceIndex"] == 2
    assert running_job.metadata["currentFileProgressPercent"] == 25.0
    assert running_job.metadata["overallProgressPercent"] == 62.5
    assert running_job.progress.percent == 62.5
    app.state.services.daw.export_progress_release_event.set()
    job = _wait_for_job_state(app, response["jobId"], "succeeded")
    assert job.result["status"] == "completed_with_errors"


def test_export_run_start_marks_completed_with_errors_and_keeps_successful_exports(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    session_root = tmp_path / "session"
    session_root.mkdir(parents=True)
    app.state.services.daw.session_path = str(session_root / "Demo Session.ptx")
    app.state.services.daw.export_fail_name_fragments.add("Bridge")
    output_path = tmp_path / "exports"
    payload = _build_export_run_payload(
        output_path,
        snapshots=[
            {"name": "Verse", "trackStates": [{"trackName": "Kick", "isMuted": True, "isSoloed": False}]},
            {"name": "Bridge", "trackStates": [{"trackName": "Kick", "isMuted": False, "isSoloed": False}]},
        ],
    )

    response = start_export_run(app.state.services, payload, capability_id="daw.export.run.start")

    assert response["jobId"]
    job = _wait_for_job_state(app, response["jobId"], "succeeded")
    assert job.result["status"] == "completed_with_errors"
    assert job.result["success"] is False
    assert job.result["exportedFiles"] == [str(output_path / "Mix_Verse.wav")]
    assert job.result["failedSnapshots"] == ["Bridge"]
    assert job.result["failedSnapshotDetails"][0]["snapshotName"] == "Bridge"
    assert "export failed for temp_export_Bridge" in job.result["failedSnapshotDetails"][0]["error"]
    assert "Bridge" in str(job.result["errorMessage"])


def test_export_run_start_waits_for_bounced_file_to_appear(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    session_root = tmp_path / "session"
    session_root.mkdir(parents=True)
    app.state.services.daw.session_path = str(session_root / "Demo Session.ptx")
    app.state.services.daw.export_write_delay_seconds = 0.2
    output_path = tmp_path / "exports"
    payload = _build_export_run_payload(
        output_path,
        snapshots=[
            {
                "name": "Verse",
                "trackStates": [
                    {"trackName": "Kick", "isMuted": True, "isSoloed": False},
                ],
            },
        ],
    )

    response = start_export_run(app.state.services, payload, capability_id="daw.export.run.start")

    assert response["jobId"]
    job = _wait_for_job_state(app, response["jobId"], "succeeded")
    assert job.result["status"] == "completed"
    assert job.result["failedSnapshots"] == []
    assert job.result["exportedFiles"] == [str(output_path / "Mix_Verse.wav")]
    assert (output_path / "Mix_Verse.wav").is_file()
    assert not (output_path / "Mix_Bridge.wav").exists()


def test_update_export_run_progress_promotes_job_to_running_state() -> None:
    app = _app_with_fake_daw()
    job = app.state.services.job_manager.create(
        JobsCreateRequest(
            capability="daw.export.run.start",
            target_daw="pro_tools",
            state="queued",
        )
    ).job

    _update_export_run_progress(
        app.state.services,
        job,
        started_at=time.time() - 1,
        snapshot_index=1,
        snapshot_name="Verse A",
        total_snapshots=5,
        step_progress=29.0,
        message="Exporting Verse A.",
        exported_count=1,
        current_mix_source_name="Out 1-2",
        current_mix_source_index=1,
        total_mix_sources=1,
        current_file_progress_percent=29.0,
        overall_progress_percent=25.8,
    )

    updated = app.state.services.job_manager.get(job.job_id)
    assert updated.state == "running"
    assert updated.started_at is not None


@pytest.mark.parametrize("capability_id", ["daw.export.start", "daw.export.direct.start"])
def test_export_run_setup_errors_are_attributed_to_export_capability(capability_id: str) -> None:
    app = _app_without_daw()

    with pytest.raises(PrestoError) as exc_info:
        start_export_run(
            app.state.services,
            {
                "outputPath": "/Users/test/Exports",
                "fileName": "mix-print",
                "fileType": "WAV",
            },
            capability_id=capability_id,
        )

    assert exc_info.value.code == "DAW_UNAVAILABLE"
    assert exc_info.value.capability == capability_id


def test_jobs_get_returns_live_import_run_state() -> None:
    app = _app_with_fake_daw()
    _seed_running_job(app, job_id="import-123")
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-jobs-get-import-1",
            capability="jobs.get",
            payload={"jobId": "import-123"},
        ),
    )

    assert response.success is True
    assert response.data["job"]["jobId"] == "import-123"
    assert response.data["job"]["state"] == "running"
    assert response.data["job"]["progress"]["phase"] == "running"


def test_jobs_cancel_cancels_import_run() -> None:
    app = _app_with_fake_daw()
    _seed_running_job(app, job_id="import-456")
    request = DummyRequest(app=app)

    response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-jobs-cancel-import-1",
            capability="jobs.cancel",
            payload={"jobId": "import-456"},
        ),
    )

    assert response.success is True
    assert response.data == {"cancelled": True, "jobId": "import-456"}
    assert app.state.services.job_manager.get("import-456").state == "cancelled"


def test_jobs_cancel_stops_running_import_before_completion(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    app.state.services.daw.block_until_released = True
    source_folder = _create_audio_source_folder(tmp_path, file_names=["kick.wav"])
    start_response = start_import_run(
        app.state.services,
        {"folderPaths": [str(source_folder)]},
    )

    assert start_response["jobId"]
    assert app.state.services.daw.started_event.wait(timeout=2)

    request = DummyRequest(app=app)
    cancel_response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-jobs-cancel-import-2",
            capability="jobs.cancel",
            payload={"jobId": start_response["jobId"]},
        ),
    )

    assert cancel_response.success is True
    app.state.services.daw.release_event.set()
    cancelled_job = _wait_for_job_state(app, start_response["jobId"], "cancelled")
    assert cancelled_job.progress.phase == "cancelled"
    assert cancelled_job.finished_at is not None


def test_jobs_cancel_stops_running_export_before_completion(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    app.state.services.daw.export_block_until_released = True
    output_path = tmp_path / "exports"
    start_response = start_export_run(
        app.state.services,
        {
            "outputPath": str(output_path),
            "fileName": "mix-print",
            "fileType": "WAV",
            "offline": True,
        },
        capability_id="daw.export.start",
    )

    assert start_response["jobId"]
    assert app.state.services.daw.export_started_event.wait(timeout=2)

    request = DummyRequest(app=app)
    cancel_response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-jobs-cancel-export-1",
            capability="jobs.cancel",
            payload={"jobId": start_response["jobId"]},
        ),
    )

    assert cancel_response.success is True
    cancelled_job = _wait_for_job_state(app, start_response["jobId"], "cancelled")
    assert cancelled_job.progress.phase == "cancelled"
    assert cancelled_job.finished_at is not None
    assert app.state.services.daw.export_cancel_calls == 1


def test_jobs_cancel_stops_running_export_workflow_before_completion(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    app.state.services.daw.export_block_until_released = True
    session_root = tmp_path / "session"
    session_root.mkdir(parents=True)
    app.state.services.daw.session_path = str(session_root / "Demo Session.ptx")
    payload = _build_export_run_payload(
        tmp_path / "exports",
        snapshots=[
            {"name": "Verse", "trackStates": [{"trackName": "Kick", "isMuted": True, "isSoloed": False}]},
        ],
    )

    start_response = start_export_run(app.state.services, payload, capability_id="daw.export.run.start")

    assert start_response["jobId"]
    assert app.state.services.daw.export_started_event.wait(timeout=2)

    request = DummyRequest(app=app)
    cancel_response = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-jobs-cancel-export-run-1",
            capability="jobs.cancel",
            payload={"jobId": start_response["jobId"]},
        ),
    )

    assert cancel_response.success is True
    cancelled_job = _wait_for_job_state(app, start_response["jobId"], "cancelled")
    assert cancelled_job.progress.phase == "cancelled"
    assert cancelled_job.finished_at is not None
    assert app.state.services.daw.export_cancel_calls == 1


def test_jobs_create_and_update_manage_manual_job_records() -> None:
    app = _app_with_fake_daw()
    request = DummyRequest(app=app)

    created = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-jobs-create-1",
            capability="jobs.create",
            payload={
                "capability": "jobs.create",
                "targetDaw": "pro_tools",
                "state": "queued",
                "progress": {
                    "phase": "queued",
                    "current": 0,
                    "total": 2,
                    "message": "Queued manual job.",
                },
                "metadata": {"source": "test"},
            },
        ),
    )

    assert created.success is True
    job_id = created.data["job"]["jobId"]
    assert created.data["job"]["state"] == "queued"
    assert created.data["job"]["progress"]["percent"] == 0.0
    assert created.data["job"]["metadata"] == {"source": "test"}

    updated = invoke_capability(
        request,
        CapabilityInvokeRequestSchema(
            requestId="req-jobs-update-1",
            capability="jobs.update",
            payload={
                "jobId": job_id,
                "state": "succeeded",
                "progress": {
                    "phase": "succeeded",
                    "current": 2,
                    "total": 2,
                    "message": "Done.",
                },
                "result": {"ok": True},
            },
        ),
    )

    assert updated.success is True
    assert updated.data["job"]["jobId"] == job_id
    assert updated.data["job"]["state"] == "succeeded"
    assert updated.data["job"]["progress"]["percent"] == 100.0
    assert updated.data["job"]["result"] == {"ok": True}


def test_import_run_start_preserves_raw_code_and_raw_message_on_failure(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    app.state.services.daw.import_error = PrestoError(
        "PTSL_IMPORT_FAILED",
        "Import failed.",
        details={
            "rawCode": "PTSL_IMPORT_FAILED",
            "rawMessage": "Import failed.",
        },
        capability="daw.import.run.start",
        adapter="pro_tools",
    )
    source_folder = _create_audio_source_folder(tmp_path, file_names=["snare.wav"])
    response = start_import_run(app.state.services, {"folderPaths": [str(source_folder)]})

    assert response["jobId"]
    job = _wait_for_job_state(app, response["jobId"], "failed")
    assert job.state == "failed"
    assert job.error is not None
    assert job.error.details == {
        "rawCode": "PTSL_IMPORT_FAILED",
        "rawMessage": "Import failed.",
    }


def test_import_run_start_rejects_old_finalize_shape() -> None:
    app = _app_with_fake_daw()

    with pytest.raises(PrestoValidationError) as exc_info:
        start_import_run(
            app.state.services,
            {
                "items": [
                    {
                        "filePath": "/Volumes/Samples/kick.wav",
                        "categoryId": "drums",
                        "targetTrackName": "Kick In",
                    }
                ]
            },
        )

    assert exc_info.value.message == "folderPaths is required."


def test_import_run_start_rejects_old_file_paths_shape() -> None:
    app = _app_with_fake_daw()

    with pytest.raises(PrestoValidationError) as exc_info:
        start_import_run(
            app.state.services,
            {
                "filePaths": ["/Volumes/Samples/kick.wav"],
            },
        )

    assert exc_info.value.message == "folderPaths is required."


def test_import_run_start_rejects_missing_folder_paths_directory(tmp_path: Path) -> None:
    app = _app_with_fake_daw()
    missing_folder = tmp_path / "missing"

    with pytest.raises(PrestoValidationError) as exc_info:
        start_import_run(
            app.state.services,
            {
                "folderPaths": [str(missing_folder)],
            },
        )

    assert exc_info.value.message == f"folder does not exist: {missing_folder.resolve()}"
    assert exc_info.value.details["field"] == "folderPaths"
