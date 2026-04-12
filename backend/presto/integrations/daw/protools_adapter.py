from __future__ import annotations

from typing import Any
from pathlib import Path
from ctypes import cdll, c_bool, c_char_p, c_long, c_void_p, create_string_buffer
from ctypes.util import find_library
import math
import re
import threading
import time
import uuid

from ...domain.errors import PrestoError, PrestoValidationError
from ..mac import MacAutomationError
from .base import (
    DawAdapterCapabilitySnapshot,
    DawConnectionStatus,
    DawSessionInfo,
    DawTrackInfo,
    DawTransportStatus,
)
from .ptsl_catalog import PtslCommandCatalogEntry, list_commands, require_command
from .ptsl_runner import PtslCommandRunner

try:  # pragma: no cover - exercised only in a Pro Tools runtime environment
    from ptsl import Engine, PTSL_pb2 as pt
except Exception:  # pragma: no cover - evaluated when py-ptsl is unavailable
    Engine = None  # type: ignore[assignment]
    pt = None  # type: ignore[assignment]


def _convert_posix_directory_to_hfs(path: str) -> str:
    text = str(path).strip()
    if not text:
        raise ValueError("empty_directory_path")
    if not text.startswith("/"):
        return text if text.endswith(":") else f"{text}:"

    resolved = str(Path(text).expanduser().resolve())
    core_foundation = cdll.LoadLibrary(find_library("CoreFoundation"))
    utf8_encoding = 0x08000100
    posix_path_style = 0
    hfs_path_style = 1

    core_foundation.CFStringCreateWithCString.argtypes = [c_void_p, c_char_p, c_long]
    core_foundation.CFStringCreateWithCString.restype = c_void_p
    core_foundation.CFURLCreateWithFileSystemPath.argtypes = [c_void_p, c_void_p, c_long, c_bool]
    core_foundation.CFURLCreateWithFileSystemPath.restype = c_void_p
    core_foundation.CFURLCopyFileSystemPath.argtypes = [c_void_p, c_long]
    core_foundation.CFURLCopyFileSystemPath.restype = c_void_p
    core_foundation.CFStringGetCString.argtypes = [c_void_p, c_char_p, c_long, c_long]
    core_foundation.CFStringGetCString.restype = c_bool
    core_foundation.CFRelease.argtypes = [c_void_p]
    core_foundation.CFRelease.restype = None

    allocator = c_void_p.in_dll(core_foundation, "kCFAllocatorDefault")
    path_ref = core_foundation.CFStringCreateWithCString(allocator, resolved.encode("utf-8"), utf8_encoding)
    if not path_ref:
        raise ValueError("hfs_path_create_failed")

    url_ref = core_foundation.CFURLCreateWithFileSystemPath(allocator, path_ref, posix_path_style, True)
    if not url_ref:
        core_foundation.CFRelease(path_ref)
        raise ValueError("hfs_url_create_failed")

    hfs_ref = core_foundation.CFURLCopyFileSystemPath(url_ref, hfs_path_style)
    if not hfs_ref:
        core_foundation.CFRelease(url_ref)
        core_foundation.CFRelease(path_ref)
        raise ValueError("hfs_path_copy_failed")

    try:
        buffer = create_string_buffer(4096)
        ok = core_foundation.CFStringGetCString(hfs_ref, buffer, len(buffer), utf8_encoding)
        if not ok:
            raise ValueError("hfs_path_decode_failed")
        converted = buffer.value.decode("utf-8").strip()
    finally:
        core_foundation.CFRelease(hfs_ref)
        core_foundation.CFRelease(url_ref)
        core_foundation.CFRelease(path_ref)

    if not converted:
        raise ValueError("empty_hfs_path")
    return converted if converted.endswith(":") else f"{converted}:"


class ProToolsDawAdapter:
    """PTSL-backed Pro Tools adapter for the host integration layer."""
    DEFAULT_MIN_SUPPORTED_VERSION = "2025.10"
    DEFAULT_ADAPTER_VERSION = "2025.10.0"
    DEFAULT_MODULE_VERSIONS: dict[str, str] = {
        "system": DEFAULT_ADAPTER_VERSION,
        "config": DEFAULT_ADAPTER_VERSION,
        "daw": DEFAULT_ADAPTER_VERSION,
        "connection": DEFAULT_ADAPTER_VERSION,
        "automation": DEFAULT_ADAPTER_VERSION,
        "session": DEFAULT_ADAPTER_VERSION,
        "track": DEFAULT_ADAPTER_VERSION,
        "clip": DEFAULT_ADAPTER_VERSION,
        "transport": DEFAULT_ADAPTER_VERSION,
        "import": DEFAULT_ADAPTER_VERSION,
        "stripSilence": DEFAULT_ADAPTER_VERSION,
        "export": DEFAULT_ADAPTER_VERSION,
        "jobs": DEFAULT_ADAPTER_VERSION,
    }
    SESSION_TIMECODE_RATES: dict[int, tuple[float, bool]] = {
        0: (24000 / 1001, False),
        1: (24.0, False),
        2: (25.0, False),
        3: (30000 / 1001, False),
        4: (30000 / 1001, True),
        5: (30.0, False),
        6: (30.0, True),
        7: (48000 / 1001, False),
        8: (48.0, False),
        9: (50.0, False),
        10: (60000 / 1001, False),
        11: (60000 / 1001, True),
        12: (60.0, False),
        13: (60.0, True),
        14: (100.0, False),
        15: (120000 / 1001, False),
        16: (120000 / 1001, True),
        17: (120.0, False),
        18: (120.0, True),
    }

    def __init__(
        self,
        *,
        company_name: str = "Luminous Layers",
        application_name: str = "Presto",
        address: str = "localhost:31416",
        ptsl_runner: PtslCommandRunner | None = None,
    ) -> None:
        self.company_name = company_name
        self.application_name = application_name
        self.address = address
        self._engine = None
        self._connected = False
        self._ptsl_runner = ptsl_runner or PtslCommandRunner()

    def is_connected(self) -> bool:
        return self._connected and self._engine is not None

    def connect(
        self,
        host: str | None = None,
        port: int | None = None,
        timeout_seconds: int | None = None,
    ) -> bool:
        if self.is_connected():
            return True

        address = self._resolve_address(host=host, port=port)
        if address != self.address:
            self.address = address

        if Engine is None:
            raise PrestoError(
                "PTSL_NOT_INSTALLED",
                "py-ptsl is not available in this environment.",
                source="runtime",
                retryable=False,
                details=self._raw_error_details(
                    "PTSL_NOT_INSTALLED",
                    "py-ptsl is not available in this environment.",
                    address=self.address,
                    timeout_seconds=timeout_seconds,
                ),
                capability="daw.connection.connect",
                adapter="pro_tools",
            )

        try:
            if timeout_seconds is not None and timeout_seconds > 0:
                connection_result: dict[str, Any] = {}

                def _connect_engine() -> None:
                    try:
                        engine = Engine(
                            company_name=self.company_name,
                            application_name=self.application_name,
                            address=address,
                        )
                        engine.host_ready_check()
                        connection_result["engine"] = engine
                    except Exception as exc:  # pragma: no cover - exercised through caller assertions
                        connection_result["error"] = exc

                worker = threading.Thread(target=_connect_engine, name="presto-ptsl-connect", daemon=True)
                worker.start()
                worker.join(float(timeout_seconds))
                if worker.is_alive():
                    raise TimeoutError(f"Timed out after {timeout_seconds} seconds while connecting to Pro Tools.")
                if "error" in connection_result:
                    raise connection_result["error"]
                engine = connection_result["engine"]
            else:
                engine = Engine(
                    company_name=self.company_name,
                    application_name=self.application_name,
                    address=address,
                )
                engine.host_ready_check()
        except Exception as exc:
            self._engine = None
            self._connected = False
            raise PrestoError(
                "PTSL_CONNECT_FAILED",
                str(exc) or "Failed to connect to Pro Tools.",
                source="runtime",
                retryable=False,
                details=self._raw_error_details(
                    "PTSL_CONNECT_FAILED",
                    str(exc) or "Failed to connect to Pro Tools.",
                    address=address,
                    timeout_seconds=timeout_seconds,
                    exception_type=type(exc).__name__,
                    raw_exception=str(exc) or None,
                ),
                capability="daw.connection.connect",
                adapter="pro_tools",
            ) from exc

        self._engine = engine
        self._connected = True
        return True

    def disconnect(self) -> None:
        if self._engine is None:
            self._connected = False
            return

        try:
            close = getattr(self._engine, "close", None)
            if callable(close):
                close()
        finally:
            self._engine = None
            self._connected = False

    def save_session(self) -> None:
        self._run_ptsl_command(
            command_name="CId_SaveSession",
            payload={},
            capability="daw.session.save",
            unavailable_code="SAVE_SESSION_UNAVAILABLE",
            unavailable_message="Pro Tools session save is unavailable on the current engine.",
            failed_code="SAVE_SESSION_FAILED",
            failed_message="Failed to save the current Pro Tools session.",
        )

    def get_connection_status(self) -> DawConnectionStatus:
        engine = self._engine
        session_path = self._read_session_path(engine) if engine is not None else ""
        session_name = self._read_session_name(engine) if engine is not None else ""
        host_version = self._detect_host_version(engine) if engine is not None else None

        return DawConnectionStatus(
            connected=self.is_connected(),
            session_open=bool(session_path),
            host_version=host_version,
            session_name=session_name or None,
            session_path=session_path or None,
        )

    def get_adapter_capability_snapshot(self) -> DawAdapterCapabilitySnapshot:
        status = self.get_connection_status()
        return DawAdapterCapabilitySnapshot(
            adapter_version=self.DEFAULT_ADAPTER_VERSION,
            host_version=status.host_version,
            module_versions=dict(self.DEFAULT_MODULE_VERSIONS),
            capability_versions={},
        )

    def ensure_session_open(self) -> str:
        engine = self._require_engine()
        session_path = self._read_session_path(engine)
        if session_path:
            return session_path

        try:
            response = self._ptsl_runner.run(
                engine,
                "CId_GetSessionPath",
                {},
                capability="daw.session.getInfo",
            )
            session_path = self._string_or_empty(self._record_get(self._record_get(response, "session_path"), "path"))
        except Exception as exc:
            raise PrestoError(
                "SESSION_CHECK_FAILED",
                str(exc) or "Failed to read the open Pro Tools session.",
                source="runtime",
                retryable=False,
                details=self._raw_error_details(
                    "SESSION_CHECK_FAILED",
                    str(exc) or "Failed to read the open Pro Tools session.",
                    address=self.address,
                    exception_type=type(exc).__name__,
                    raw_exception=str(exc) or None,
                ),
                capability="daw.session.getInfo",
                adapter="pro_tools",
            ) from exc

        if not session_path:
            raise PrestoError(
                "NO_OPEN_SESSION",
                "No open Pro Tools session found.",
                source="runtime",
                retryable=False,
                details={"address": self.address},
                capability="daw.session.getInfo",
                adapter="pro_tools",
            )
        return session_path

    def get_session_info(self) -> DawSessionInfo:
        engine = self._require_engine()
        session_name = self._read_session_name(engine)
        session_path = self.ensure_session_open()
        sample_rate = self._read_session_sample_rate(engine)
        bit_depth = self._normalize_bit_depth(self._read_session_bit_depth(engine))

        return DawSessionInfo(
            session_name=session_name or "",
            session_path=session_path,
            sample_rate=sample_rate,
            bit_depth=bit_depth,
            is_playing=self.get_transport_status().is_playing,
            is_recording=self.get_transport_status().is_recording,
        )

    def get_session_length(self) -> float:
        engine = self._require_engine()
        self.ensure_session_open()

        session_length = getattr(engine, "session_length", None)
        if not callable(session_length):
            raise PrestoError(
                "SESSION_LENGTH_UNAVAILABLE",
                "Pro Tools session length is unavailable on the current engine.",
                source="runtime",
                retryable=False,
                details=self._raw_error_details(
                    "SESSION_LENGTH_UNAVAILABLE",
                    "Pro Tools session length is unavailable on the current engine.",
                    address=self.address,
                ),
                capability="daw.session.getLength",
                adapter="pro_tools",
            )

        try:
            return self._coerce_session_length_seconds(
                session_length(),
                self._read_session_timecode_rate(engine),
            )
        except Exception as exc:
            raise PrestoError(
                "SESSION_LENGTH_FAILED",
                str(exc) or "Failed to read the current Pro Tools session length.",
                source="runtime",
                retryable=False,
                details=self._raw_error_details(
                    "SESSION_LENGTH_FAILED",
                    str(exc) or "Failed to read the current Pro Tools session length.",
                    address=self.address,
                    exception_type=type(exc).__name__,
                    raw_exception=str(exc) or None,
                ),
                capability="daw.session.getLength",
                adapter="pro_tools",
            ) from exc

    def _coerce_session_length_seconds(self, value: Any, timecode_rate: Any | None = None) -> float:
        if isinstance(value, (int, float)):
            return float(value)

        text = str(value).strip()
        if not text:
            raise ValueError("empty_session_length")

        try:
            return float(text)
        except ValueError:
            pass

        rate_info = self._resolve_session_timecode_rate(timecode_rate)
        if rate_info is None:
            raise ValueError(f"missing_timecode_rate:{timecode_rate!r}")

        frames_per_second, is_drop_frame = rate_info

        timecode_match = re.fullmatch(
            r"(?P<hours>\d+):(?P<minutes>\d{2}):(?P<seconds>\d{2})(?::(?P<frames>\d{2}))?(?:\.(?P<subframes>\d{2}))?",
            text,
        )
        if timecode_match:
            hours = int(timecode_match.group("hours"))
            minutes = int(timecode_match.group("minutes"))
            seconds = int(timecode_match.group("seconds"))
            frames = int(timecode_match.group("frames") or "0")
            subframes = int(timecode_match.group("subframes") or "0")
            if is_drop_frame:
                nominal_fps = round(frames_per_second)
                drop_frames = round(nominal_fps * 0.0666666667)
                total_minutes = (hours * 60) + minutes
                dropped_frame_count = drop_frames * (total_minutes - (total_minutes // 10))
                absolute_frames = (((hours * 3600) + (minutes * 60) + seconds) * nominal_fps) + frames - dropped_frame_count
                return float((absolute_frames + (subframes / 100)) / frames_per_second)

            return float(hours * 3600 + minutes * 60 + seconds + ((frames + (subframes / 100)) / frames_per_second))

        raise ValueError(f"unsupported_session_length:{text}")

    def _read_session_timecode_rate(self, engine: Any) -> Any | None:
        return self._read_engine_value(engine, "session_timecode_rate")

    def _resolve_session_timecode_rate(self, value: Any | None) -> tuple[float, bool] | None:
        if value is None:
            return None

        if hasattr(value, "value"):
            enum_value = getattr(value, "value")
            if isinstance(enum_value, int):
                value = enum_value

        try:
            numeric = int(value)
        except Exception:
            numeric = None

        if numeric is not None:
            return self.SESSION_TIMECODE_RATES.get(numeric)

        text = str(value).strip()
        if not text:
            return None

        normalized = text.lower().replace("_", "").replace("-", "")
        for code, (fps, drop_frame) in self.SESSION_TIMECODE_RATES.items():
            if pt is not None:
                enum_name = pt.SessionTimeCodeRate.Name(code).lower().replace("_", "")
                if enum_name == normalized:
                    return fps, drop_frame

        return None

    def ensure_minimum_version(self) -> str:
        engine = self._require_engine()
        detected = self._detect_host_version(engine)
        if not detected:
            raise PrestoError(
                "PT_VERSION_UNKNOWN",
                "Unable to detect Pro Tools/PTSL version.",
                source="runtime",
                retryable=False,
                details={"minimum_supported": self.DEFAULT_MIN_SUPPORTED_VERSION},
                capability="daw.connection.getStatus",
                adapter="pro_tools",
            )

        current_tuple = self._parse_version_tuple(detected)
        minimum_tuple = self._parse_version_tuple(self.DEFAULT_MIN_SUPPORTED_VERSION)
        if current_tuple is None or minimum_tuple is None:
            raise PrestoError(
                "PT_VERSION_CHECK_FAILED",
                f"Cannot compare versions (current='{detected}', minimum='{self.DEFAULT_MIN_SUPPORTED_VERSION}').",
                source="runtime",
                retryable=False,
                details={"detected": detected, "minimum": self.DEFAULT_MIN_SUPPORTED_VERSION},
                capability="daw.connection.getStatus",
                adapter="pro_tools",
            )

        if current_tuple < minimum_tuple:
            raise PrestoError(
                "PT_VERSION_UNSUPPORTED",
                f"Current Pro Tools/PTSL version {detected} is below required {self.DEFAULT_MIN_SUPPORTED_VERSION}.",
                source="runtime",
                retryable=False,
                details={"detected": detected, "minimum": self.DEFAULT_MIN_SUPPORTED_VERSION},
                capability="daw.connection.getStatus",
                adapter="pro_tools",
            )

        return detected

    def list_track_names(self) -> list[str]:
        return [track.track_name for track in self.list_tracks()]

    def get_selected_track_names(self) -> list[str]:
        engine = self._require_engine()
        self.ensure_session_open()
        return self._detect_selected_track_names(engine)

    def list_tracks(self) -> list[DawTrackInfo]:
        engine = self._require_engine()
        tracks = self._read_tracks(engine)
        result: list[DawTrackInfo] = []
        for index, track in enumerate(tracks):
            attrs = self._record_get(track, "track_attributes")
            result.append(
                DawTrackInfo(
                    track_id=str(self._record_get(track, "id", "track_id", default=index + 1)),
                    track_name=str(self._record_get(track, "name", default="")),
                    track_type=self._map_track_type(self._record_get(track, "type")),
                    track_format=self._map_track_format(self._record_get(track, "format")),
                    is_muted=bool(self._record_get(attrs, "is_muted", default=self._record_get(track, "is_muted", default=False))),
                    is_soloed=bool(self._record_get(attrs, "is_soloed", default=self._record_get(track, "is_soloed", default=False))),
                    color=self._string_or_none(self._record_get(track, "color")),
                )
            )
        return result

    def get_transport_status(self) -> DawTransportStatus:
        response = self._run_ptsl_command(
            command_name="CId_GetTransportState",
            payload={},
            capability="daw.transport.getStatus",
            unavailable_code="TRANSPORT_STATUS_UNAVAILABLE",
            unavailable_message="The current Pro Tools engine cannot read transport state.",
            failed_code="TRANSPORT_STATUS_FAILED",
            failed_message="Failed to read Pro Tools transport state.",
        )

        state = self._read_transport_state(response)
        return DawTransportStatus(
            state=state,
            is_playing=state == "playing",
            is_recording=state == "recording",
        )

    def play(self) -> None:
        engine = self._require_engine()
        status = self.get_transport_status()
        if status.is_playing:
            return

        self._run_transport_command(
            "CId_SetPlaybackMode",
            {"playback_mode": getattr(pt, "PM_Normal", 0)},
            capability_id="daw.transport.play",
        )
        self._run_transport_command("CId_TogglePlayState", {}, capability_id="daw.transport.play")

    def stop(self) -> None:
        engine = self._require_engine()
        status = self.get_transport_status()
        if not status.is_playing and not status.is_recording:
            return

        self._run_transport_command("CId_TogglePlayState", {}, capability_id="daw.transport.stop")

    def record(self) -> None:
        engine = self._require_engine()
        status = self.get_transport_status()
        if status.is_recording:
            return

        self._run_transport_command(
            "CId_SetRecordMode",
            {
                "record_mode": getattr(pt, "RM_Normal", 0),
                "record_arm_transport": True,
            },
            capability_id="daw.transport.record",
        )
        self._run_transport_command("CId_TogglePlayState", {}, capability_id="daw.transport.record")

    def import_audio_file(self, path: str) -> str:
        imported = self.import_audio_files([path])
        if not imported:
            raise PrestoError(
                "TRACK_DETECTION_FAILED",
                "Import succeeded but no new track was detected.",
                source="runtime",
                retryable=False,
                details=self._raw_error_details(
                    "TRACK_DETECTION_FAILED",
                    "Import succeeded but no new track was detected.",
                    address=self.address,
                    file_path=path,
                ),
                capability="daw.import.run.start",
                adapter="pro_tools",
            )
        return imported[0]

    def import_audio_files(self, paths: list[str]) -> list[str]:
        if not paths:
            return []

        engine = self._require_engine()
        self.ensure_session_open()
        file_paths = [str(Path(path).expanduser().resolve()) for path in paths]
        if len(file_paths) > 1:
            imported: list[str] = []
            for file_path in file_paths:
                imported.append(self.import_audio_file(file_path))
            return imported

        before = self.list_track_names()

        try:
            self._import_audio(engine, file_paths, convert=False)
        except Exception as exc:
            if not self._is_sample_rate_mismatch_error(exc):
                raise PrestoError(
                    "IMPORT_FAILED",
                    str(exc) or "Failed to import audio into Pro Tools.",
                    source="runtime",
                    retryable=False,
                    details=self._raw_error_details(
                        "IMPORT_FAILED",
                        str(exc) or "Failed to import audio into Pro Tools.",
                        address=self.address,
                        file_paths=file_paths,
                        exception_type=type(exc).__name__,
                        raw_exception=str(exc) or None,
                    ),
                    capability="daw.import.run.start",
                    adapter="pro_tools",
                ) from exc
            try:
                self._import_audio(engine, file_paths, convert=True)
            except Exception as convert_exc:
                if len(file_paths) == 1:
                    raise PrestoError(
                        "IMPORT_FAILED",
                        (
                            "Sample rate mismatch detected and automatic sample-rate conversion failed: "
                            f"{convert_exc}"
                        ),
                        source="runtime",
                        retryable=False,
                        details=self._raw_error_details(
                            "IMPORT_FAILED",
                            (
                                "Sample rate mismatch detected and automatic sample-rate conversion failed: "
                                f"{convert_exc}"
                            ),
                            address=self.address,
                            file_paths=file_paths,
                            exception_type=type(convert_exc).__name__,
                            raw_exception=str(convert_exc) or None,
                        ),
                        capability="daw.import.run.start",
                        adapter="pro_tools",
                    ) from convert_exc

                imported: list[str] = []
                for file_path in file_paths:
                    imported.append(self.import_audio_file(file_path))
                return imported

        after = self.list_track_names()
        new_tracks = self._diff_new_tracks(before, after)
        if len(new_tracks) != len(file_paths) and len(file_paths) == 1:
            raise PrestoError(
                "TRACK_DETECTION_FAILED",
                (
                    "Import succeeded but track detection count mismatch. "
                    f"Expected {len(file_paths)} new tracks, got {len(new_tracks)}."
                ),
                source="runtime",
                retryable=False,
                details=self._raw_error_details(
                    "TRACK_DETECTION_FAILED",
                    (
                        "Import succeeded but track detection count mismatch. "
                        f"Expected {len(file_paths)} new tracks, got {len(new_tracks)}."
                    ),
                    address=self.address,
                    file_paths=file_paths,
                    detected_tracks=new_tracks or None,
                ),
                capability="daw.import.run.start",
                adapter="pro_tools",
            )
        return new_tracks

    def set_timeline_selection(self, **kwargs) -> tuple[str, str]:
        self.ensure_session_open()
        request = {
            "in_time": str(kwargs.get("in_time", "")),
            "out_time": str(kwargs.get("out_time", "")),
            "location_type": "TLType_TimeCode",
        }
        self._run_ptsl_command(
            command_name="CId_SetTimelineSelection",
            payload=request,
            capability="daw.export.range.set",
            unavailable_code="TIMELINE_SELECTION_UNAVAILABLE",
            unavailable_message="Pro Tools timeline selection API is unavailable on the current engine.",
            failed_code="TIMELINE_SELECTION_SET_FAILED",
            failed_message="Failed to set timeline selection.",
            failed_details={"request": request},
        )
        selection = self._run_ptsl_command(
            command_name="CId_GetTimelineSelection",
            payload={"location_type": "TLType_TimeCode"},
            capability="daw.export.range.set",
            unavailable_code="TIMELINE_SELECTION_UNAVAILABLE",
            unavailable_message="Pro Tools timeline selection API is unavailable on the current engine.",
            failed_code="TIMELINE_SELECTION_SET_FAILED",
            failed_message="Failed to read timeline selection.",
        )
        return self._coerce_timeline_selection(selection)

    def export_mix(self, **kwargs) -> None:
        self.ensure_session_open()
        request = self._build_export_mix_request_payload(kwargs)
        self._run_ptsl_command(
            command_name="CId_ExportMix",
            payload=request,
            capability="daw.export.start",
            unavailable_code="EXPORT_MIX_UNAVAILABLE",
            unavailable_message="Pro Tools export mix API is unavailable on the current engine.",
            failed_code="EXPORT_MIX_FAILED",
            failed_message="Failed to export mix from Pro Tools.",
            failed_details={
                "output_path": kwargs.get("output_path"),
                "file_name": request.get("file_name"),
                "source_name": self._record_get((request.get("mix_source_list") or [{}])[0], "name"),
            },
        )

    def export_mix_with_progress(self, **kwargs) -> str:
        task_id = str(kwargs.get("task_id") or "").strip() or str(uuid.uuid4())
        on_progress = kwargs.get("on_progress")
        if on_progress is not None and not callable(on_progress):
            raise PrestoValidationError(
                "on_progress must be callable.",
                capability="daw.export.start",
                details=self._raw_error_details("VALIDATION_ERROR", "on_progress must be callable.", field="on_progress"),
            )
        progress_callback = on_progress if callable(on_progress) else None
        if progress_callback is not None:
            progress_callback(
                {
                    "taskId": task_id,
                    "status": "running",
                    "progressPercent": 0.0,
                }
            )

        try:
            self.export_mix(**kwargs)
        except PrestoError as exc:
            details = dict(exc.details or {})
            details.setdefault("task_id", task_id)
            raise PrestoError(
                exc.code,
                exc.message,
                source=exc.source,
                retryable=exc.retryable,
                details=details,
                capability=exc.capability,
                adapter=exc.adapter,
                status_code=exc.status_code,
            ) from exc

        if progress_callback is not None:
            progress_callback(
                {
                    "taskId": task_id,
                    "status": "completed",
                    "progressPercent": 100.0,
                }
            )

        return task_id

    def list_export_mix_sources(self, source_type: str) -> list[str]:
        self.ensure_session_open()
        resolved_source_type_name = self._resolve_export_mix_source_type_name(
            source_type,
            capability="daw.export.mixWithSource",
            field="sourceType",
        )
        request = {
            "type": resolved_source_type_name,
        }
        response = self._run_ptsl_command(
            command_name="CId_GetExportMixSourceList",
            payload=request,
            capability="daw.export.mixWithSource",
            unavailable_code="EXPORT_MIX_SOURCE_LIST_UNAVAILABLE",
            unavailable_message="Pro Tools export mix source list API is unavailable on the current engine.",
            failed_code="EXPORT_MIX_SOURCE_LIST_FAILED",
            failed_message="Failed to list export mix sources from Pro Tools.",
            failed_details={"source_type": str(source_type), "request": request},
        )

        source_list = response.get("source_list") if isinstance(response, dict) else None
        if not isinstance(source_list, list):
            raise PrestoError(
                "EXPORT_MIX_SOURCE_LIST_FAILED",
                "Pro Tools returned an invalid export mix source list response.",
                source="runtime",
                retryable=False,
                details=self._raw_error_details(
                    "EXPORT_MIX_SOURCE_LIST_FAILED",
                    "Pro Tools returned an invalid export mix source list response.",
                    address=self.address,
                    source_type=str(source_type),
                    response=response,
                ),
                capability="daw.export.mixWithSource",
                adapter="pro_tools",
            )

        return [str(item) for item in source_list if str(item).strip()]

    def rename_track(self, track_name: str, new_name: str) -> None:
        self.ensure_session_open()
        current_name = str(track_name).strip()
        next_name = str(new_name).strip()
        if not current_name:
            raise PrestoError(
                "TRACK_NAME_REQUIRED",
                "Track name is required before renaming a track.",
                source="capability",
                retryable=False,
                details=self._raw_error_details(
                    "TRACK_NAME_REQUIRED",
                    "Track name is required before renaming a track.",
                ),
                capability="daw.track.rename",
                adapter="pro_tools",
            )
        if not next_name:
            raise PrestoError(
                "TRACK_NAME_REQUIRED",
                "New track name is required before renaming a track.",
                source="capability",
                retryable=False,
                details=self._raw_error_details(
                    "TRACK_NAME_REQUIRED",
                    "New track name is required before renaming a track.",
                    track_name=current_name,
                ),
                capability="daw.track.rename",
                adapter="pro_tools",
            )

        self._run_ptsl_command(
            command_name="CId_RenameTargetTrack",
            payload={
                "current_name": current_name,
                "new_name": next_name,
            },
            capability="daw.track.rename",
            unavailable_code="RENAME_TRACK_UNAVAILABLE",
            unavailable_message="The current Pro Tools engine cannot rename tracks.",
            failed_code="RENAME_TRACK_FAILED",
            failed_message=f"Failed to rename track '{current_name}'.",
            failed_details={"track_name": current_name, "new_name": next_name},
        )

    def select_track(self, track_name: str) -> None:
        self.select_tracks([track_name])

    def select_tracks(self, track_names: list[str]) -> None:
        engine = self._require_engine()
        self.ensure_session_open()
        normalized_track_names = [str(track_name).strip() for track_name in track_names if str(track_name).strip()]
        if not normalized_track_names:
            raise PrestoError(
                "TRACK_NAME_REQUIRED",
                "At least one track name is required before selecting tracks.",
                source="capability",
                retryable=False,
                details=self._raw_error_details(
                    "TRACK_NAME_REQUIRED",
                    "At least one track name is required before selecting tracks.",
                ),
                capability="daw.track.select",
                adapter="pro_tools",
            )

        self._run_ptsl_command(
            command_name="CId_SelectTracksByName",
            payload={
                "track_names": normalized_track_names,
                "selection_mode": "SM_Replace",
            },
            capability="daw.track.select",
            unavailable_code="TRACK_SELECT_UNAVAILABLE",
            unavailable_message="The current Pro Tools engine cannot select tracks by name.",
            failed_code="SELECT_TRACK_FAILED",
            failed_message="Failed to select tracks.",
            failed_details={"track_names": normalized_track_names},
        )

        selected_tracks = set(self._detect_selected_track_names(engine))
        if any(track_name not in selected_tracks for track_name in normalized_track_names):
            raise PrestoError(
                "SELECT_TRACK_FAILED",
                "One or more tracks were not selected in Pro Tools.",
                source="runtime",
                retryable=False,
                details=self._raw_error_details(
                    "SELECT_TRACK_FAILED",
                    "One or more tracks were not selected in Pro Tools.",
                    address=self.address,
                    track_names=normalized_track_names,
                    selected_tracks=sorted(selected_tracks) or None,
                ),
                capability="daw.track.select",
                adapter="pro_tools",
            )

    def apply_track_color(self, track_name: str, color_slot: int) -> None:
        self.ensure_session_open()
        normalized_track_name = str(track_name).strip()
        if not normalized_track_name:
            raise PrestoError(
                "TRACK_NAME_REQUIRED",
                "Track name is required before applying color.",
                source="capability",
                retryable=False,
                details=self._raw_error_details(
                    "TRACK_NAME_REQUIRED",
                    "Track name is required before applying color.",
                ),
                capability="daw.track.color.apply",
                adapter="pro_tools",
            )

        normalized_color_slot = self._normalize_color_slot(color_slot)
        request = {
            "track_names": [normalized_track_name],
            "color_index": normalized_color_slot,
        }
        response = self._run_ptsl_command(
            command_name="CId_SetTrackColor",
            payload=request,
            capability="daw.track.color.apply",
            unavailable_code="SET_TRACK_COLOR_UNAVAILABLE",
            unavailable_message="The current Pro Tools engine cannot set track color.",
            failed_code="SET_TRACK_COLOR_FAILED",
            failed_message=f"Failed to apply color to track '{normalized_track_name}'.",
            failed_details={
                "track_name": normalized_track_name,
                "color_slot": normalized_color_slot,
            },
        )

        success_count = self._read_track_color_success_count(response)
        if success_count is None:
            raise PrestoError(
                "SET_TRACK_COLOR_FAILED",
                f"SetTrackColor did not return a success_count confirmation for track '{normalized_track_name}'.",
                source="runtime",
                retryable=False,
                details=self._raw_error_details(
                    "SET_TRACK_COLOR_FAILED",
                    f"SetTrackColor did not return a success_count confirmation for track '{normalized_track_name}'.",
                    address=self.address,
                    track_name=normalized_track_name,
                    color_slot=normalized_color_slot,
                    command_name="CId_SetTrackColor",
                    raw_response=repr(response),
                ),
                capability="daw.track.color.apply",
                adapter="pro_tools",
            )

        if success_count < 1:
            raise PrestoError(
                "SET_TRACK_COLOR_FAILED",
                f"SetTrackColor reported success_count={success_count} for track '{normalized_track_name}'.",
                source="runtime",
                retryable=False,
                details=self._raw_error_details(
                    "SET_TRACK_COLOR_FAILED",
                    f"SetTrackColor reported success_count={success_count} for track '{normalized_track_name}'.",
                    address=self.address,
                    track_name=normalized_track_name,
                    color_slot=normalized_color_slot,
                    command_name="CId_SetTrackColor",
                    raw_response=repr(response),
                ),
                capability="daw.track.color.apply",
                adapter="pro_tools",
            )

    def set_track_pan(self, track_name: str, pan: float) -> None:
        self.ensure_session_open()
        normalized_track_name = str(track_name).strip()
        if not normalized_track_name:
            raise PrestoError(
                "TRACK_NAME_REQUIRED",
                "Track name is required before updating pan.",
                source="capability",
                retryable=False,
                details=self._raw_error_details(
                    "TRACK_NAME_REQUIRED",
                    "Track name is required before updating pan.",
                ),
                capability="daw.track.pan.set",
                adapter="pro_tools",
            )

        try:
            normalized_pan = float(pan)
        except Exception as exc:
            raise PrestoError(
                "TRACK_PAN_VALUE_INVALID",
                "Track pan value must be a number between -1.0 and 1.0.",
                source="capability",
                retryable=False,
                details=self._raw_error_details(
                    "TRACK_PAN_VALUE_INVALID",
                    "Track pan value must be a number between -1.0 and 1.0.",
                    track_name=normalized_track_name,
                    value=pan,
                    exception_type=type(exc).__name__,
                    raw_exception=str(exc) or None,
                ),
                capability="daw.track.pan.set",
                adapter="pro_tools",
            ) from exc

        if not math.isfinite(normalized_pan) or normalized_pan < -1.0 or normalized_pan > 1.0:
            raise PrestoError(
                "TRACK_PAN_VALUE_INVALID",
                "Track pan value must be between -1.0 and 1.0.",
                source="capability",
                retryable=False,
                details=self._raw_error_details(
                    "TRACK_PAN_VALUE_INVALID",
                    "Track pan value must be between -1.0 and 1.0.",
                    track_name=normalized_track_name,
                    value=normalized_pan,
                ),
                capability="daw.track.pan.set",
                adapter="pro_tools",
            )

        request = {
            "track_name": normalized_track_name,
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
                    "value": normalized_pan,
                }
            ],
        }
        self._run_ptsl_command(
            command_name="CId_SetTrackControlBreakpoints",
            payload=request,
            capability="daw.track.pan.set",
            unavailable_code="TRACK_PAN_UNAVAILABLE",
            unavailable_message="The current Pro Tools engine cannot set pan.",
            failed_code="TRACK_PAN_SET_FAILED",
            failed_message=f"Failed to update pan for '{normalized_track_name}'.",
            failed_details={"track_name": normalized_track_name, "value": normalized_pan},
        )

    def apply_track_color_batch(
        self,
        track_names: list[str],
        color_slot: int,
    ) -> None:
        self._unimplemented("apply_track_color_batch")

    def select_all_clips_on_track(self, track_name: str) -> None:
        self.ensure_session_open()
        normalized_track_name = str(track_name).strip()
        if not normalized_track_name:
            raise PrestoError(
                "TRACK_NAME_REQUIRED",
                "Track name is required before selecting clips on a track.",
                source="capability",
                retryable=False,
                details=self._raw_error_details(
                    "TRACK_NAME_REQUIRED",
                    "Track name is required before selecting clips on a track.",
                ),
                capability="daw.clip.selectAllOnTrack",
                adapter="pro_tools",
            )

        self._run_ptsl_command(
            command_name="CId_SelectAllClipsOnTrack",
            payload={"track_name": normalized_track_name},
            capability="daw.clip.selectAllOnTrack",
            unavailable_code="CLIP_SELECTION_UNAVAILABLE",
            unavailable_message="The current Pro Tools engine cannot select all clips on a track.",
            failed_code="SELECT_CLIPS_FAILED",
            failed_message=f"Failed to select clips on track '{normalized_track_name}'.",
            failed_details={"track_name": normalized_track_name},
        )

    def set_track_mute_state(self, track_name: str, muted: bool) -> None:
        self.set_track_mute_state_batch([track_name], muted)

    def set_track_mute_state_batch(self, track_names: list[str], muted: bool) -> None:
        self._set_track_toggle_state_batch(
            capability="daw.track.mute.set",
            command_name="CId_SetTrackMuteState",
            track_names=track_names,
            enabled=muted,
            unavailable_code="TRACK_MUTE_UNAVAILABLE",
            unavailable_message="The current Pro Tools engine cannot set mute state.",
            failed_code="TRACK_MUTE_SET_FAILED",
            failed_message="Failed to update mute state for one or more tracks.",
        )

    def set_track_solo_state(self, track_name: str, soloed: bool) -> None:
        self.set_track_solo_state_batch([track_name], soloed)

    def set_track_solo_state_batch(self, track_names: list[str], soloed: bool) -> None:
        self._set_track_toggle_state_batch(
            capability="daw.track.solo.set",
            command_name="CId_SetTrackSoloState",
            track_names=track_names,
            enabled=soloed,
            unavailable_code="TRACK_SOLO_UNAVAILABLE",
            unavailable_message="The current Pro Tools engine cannot set solo state.",
            failed_code="TRACK_SOLO_SET_FAILED",
            failed_message="Failed to update solo state for one or more tracks.",
        )

    def set_track_hidden_state(self, track_name: str, hidden: bool) -> None:
        self.set_track_hidden_state_batch([track_name], hidden)

    def set_track_hidden_state_batch(self, track_names: list[str], hidden: bool) -> None:
        self._set_track_toggle_state_batch(
            capability="daw.track.hidden.set",
            command_name="CId_SetTrackHiddenState",
            track_names=track_names,
            enabled=hidden,
            unavailable_code="TRACK_HIDDEN_UNAVAILABLE",
            unavailable_message="The current Pro Tools engine cannot set hidden state.",
            failed_code="TRACK_HIDDEN_SET_FAILED",
            failed_message="Failed to update hidden state for one or more tracks.",
        )

    def set_track_inactive_state(self, track_name: str, inactive: bool) -> None:
        self.set_track_inactive_state_batch([track_name], inactive)

    def set_track_inactive_state_batch(self, track_names: list[str], inactive: bool) -> None:
        self._set_track_toggle_state_batch(
            capability="daw.track.inactive.set",
            command_name="CId_SetTrackInactiveState",
            track_names=track_names,
            enabled=inactive,
            unavailable_code="TRACK_INACTIVE_UNAVAILABLE",
            unavailable_message="The current Pro Tools engine cannot set inactive state.",
            failed_code="TRACK_INACTIVE_SET_FAILED",
            failed_message="Failed to update inactive state for one or more tracks.",
        )

    def set_track_record_enable_state_batch(self, track_names: list[str], enabled: bool) -> None:
        self._set_track_toggle_state_batch(
            capability="daw.track.recordEnable.set",
            command_name="CId_SetTrackRecordEnableState",
            track_names=track_names,
            enabled=enabled,
            unavailable_code="TRACK_RECORD_ENABLE_UNAVAILABLE",
            unavailable_message="The current Pro Tools engine cannot set record enable state.",
            failed_code="TRACK_RECORD_ENABLE_SET_FAILED",
            failed_message="Failed to update record enable state for one or more tracks.",
        )

    def set_track_record_safe_state_batch(self, track_names: list[str], enabled: bool) -> None:
        self._set_track_toggle_state_batch(
            capability="daw.track.recordSafe.set",
            command_name="CId_SetTrackRecordSafeEnableState",
            track_names=track_names,
            enabled=enabled,
            unavailable_code="TRACK_RECORD_SAFE_UNAVAILABLE",
            unavailable_message="The current Pro Tools engine cannot set record safe state.",
            failed_code="TRACK_RECORD_SAFE_SET_FAILED",
            failed_message="Failed to update record safe state for one or more tracks.",
        )

    def set_track_input_monitor_state_batch(self, track_names: list[str], enabled: bool) -> None:
        self._set_track_toggle_state_batch(
            capability="daw.track.inputMonitor.set",
            command_name="CId_SetTrackInputMonitorState",
            track_names=track_names,
            enabled=enabled,
            unavailable_code="TRACK_INPUT_MONITOR_UNAVAILABLE",
            unavailable_message="The current Pro Tools engine cannot set input monitor state.",
            failed_code="TRACK_INPUT_MONITOR_SET_FAILED",
            failed_message="Failed to update input monitor state for one or more tracks.",
        )

    def set_track_online_state_batch(self, track_names: list[str], enabled: bool) -> None:
        self._set_track_toggle_state_batch(
            capability="daw.track.online.set",
            command_name="CId_SetTrackOnlineState",
            track_names=track_names,
            enabled=enabled,
            unavailable_code="TRACK_ONLINE_UNAVAILABLE",
            unavailable_message="The current Pro Tools engine cannot set online state.",
            failed_code="TRACK_ONLINE_SET_FAILED",
            failed_message="Failed to update online state for one or more tracks.",
        )

    def set_track_frozen_state_batch(self, track_names: list[str], enabled: bool) -> None:
        self._set_track_toggle_state_batch(
            capability="daw.track.frozen.set",
            command_name="CId_SetTrackFrozenState",
            track_names=track_names,
            enabled=enabled,
            unavailable_code="TRACK_FROZEN_UNAVAILABLE",
            unavailable_message="The current Pro Tools engine cannot set frozen state.",
            failed_code="TRACK_FROZEN_SET_FAILED",
            failed_message="Failed to update frozen state for one or more tracks.",
        )

    def set_track_open_state_batch(self, track_names: list[str], enabled: bool) -> None:
        self._set_track_toggle_state_batch(
            capability="daw.track.open.set",
            command_name="CId_SetTrackOpenState",
            track_names=track_names,
            enabled=enabled,
            unavailable_code="TRACK_OPEN_UNAVAILABLE",
            unavailable_message="The current Pro Tools engine cannot set open state.",
            failed_code="TRACK_OPEN_SET_FAILED",
            failed_message="Failed to update open state for one or more tracks.",
        )

    def cancel_export(self) -> None:
        self._unimplemented("cancel_export")

    def list_ptsl_commands(
        self,
        *,
        category: str | None = None,
        only_with_py_ptsl_op: bool | None = None,
    ) -> list[dict[str, Any]]:
        entries = list(list_commands())
        if category:
            normalized_category = str(category).strip()
            entries = [entry for entry in entries if entry.category == normalized_category]
        if only_with_py_ptsl_op is not None:
            entries = [entry for entry in entries if entry.has_py_ptsl_op is bool(only_with_py_ptsl_op)]
        return [self._serialize_ptsl_command_entry(entry) for entry in entries]

    def describe_ptsl_command(self, command_name: str) -> dict[str, Any]:
        entry = require_command(str(command_name).strip())
        return self._serialize_ptsl_command_entry(entry)

    def execute_ptsl_command(
        self,
        command_name: str,
        payload: dict[str, Any] | None = None,
        *,
        minimum_host_version: str | None = None,
    ) -> Any:
        normalized_command_name = str(command_name).strip()
        entry = require_command(normalized_command_name)
        return self._run_ptsl_command(
            command_name=entry.command_name,
            payload=dict(payload or {}),
            capability="daw.ptsl.command.execute",
            unavailable_code="PTSL_COMMAND_EXECUTION_UNAVAILABLE",
            unavailable_message=f"The current Pro Tools engine cannot execute {entry.command_name}.",
            failed_code="PTSL_COMMAND_EXECUTION_FAILED",
            failed_message=f"Failed to execute {entry.command_name}.",
            minimum_host_version=minimum_host_version,
            failed_details={
                "command_name": entry.command_name,
                "payload": dict(payload or {}),
                "minimum_host_version": minimum_host_version,
            },
        )

    def _require_engine(self):
        if self._engine is None:
            raise PrestoError(
                "NOT_CONNECTED",
                "Pro Tools is not connected.",
                source="runtime",
                retryable=False,
                details={"address": self.address},
                capability="daw.connection.getStatus",
                adapter="pro_tools",
            )
        return self._engine

    def _resolve_address(self, host: str | None, port: int | None) -> str:
        current_host, current_port = self._split_address(self.address)
        resolved_host = host or current_host
        resolved_port = port if port is not None else current_port
        return f"{resolved_host}:{resolved_port}"

    @staticmethod
    def _unimplemented(action: str) -> None:
        raise PrestoError(
            "PTSL_UNIMPLEMENTED",
            f"ProToolsDawAdapter does not implement {action} yet.",
            source="runtime",
            retryable=False,
            adapter="pro_tools",
        )

    @staticmethod
    def _read_engine_value(engine: Any, attr: str) -> Any:
        candidate = getattr(engine, attr, None)
        if candidate is None:
            return None
        try:
            return candidate() if callable(candidate) else candidate
        except Exception:
            return None

    def _read_session_name(self, engine: Any) -> str:
        return self._string_or_empty(self._read_engine_value(engine, "session_name"))

    def _read_session_path(self, engine: Any) -> str:
        return self._string_or_empty(self._read_engine_value(engine, "session_path"))

    def _read_session_sample_rate(self, engine: Any) -> int:
        value = self._read_engine_value(engine, "session_sample_rate")
        if value is None:
            return 48000
        try:
            return int(value)
        except Exception:
            return 48000

    def _read_session_bit_depth(self, engine: Any) -> Any:
        return self._read_engine_value(engine, "session_bit_depth")

    def _read_tracks(self, engine: Any) -> list[Any]:
        tracks = self._read_tracks_via_ptsl_command(engine)
        if tracks is not None:
            return tracks

        raise PrestoError(
            "TRACK_LIST_UNAVAILABLE",
            "Pro Tools track list API is unavailable on the current engine.",
            source="runtime",
            retryable=False,
            details=self._raw_error_details(
                "TRACK_LIST_UNAVAILABLE",
                "Pro Tools track list API is unavailable on the current engine.",
                address=self.address,
            ),
            capability="daw.track.list",
            adapter="pro_tools",
        )

    def _read_tracks_via_ptsl_command(self, engine: Any) -> list[Any] | None:
        limit = 1000
        offset = 0
        tracks: list[Any] = []
        while True:
            response = self._run_ptsl_command(
                engine=engine,
                command_name="CId_GetTrackList",
                payload={
                    "page_limit": limit,
                    "pagination_request": {
                        "limit": limit,
                        "offset": offset,
                    },
                },
                capability="daw.track.list",
                unavailable_code="TRACK_LIST_UNAVAILABLE",
                unavailable_message="Pro Tools track list API is unavailable on the current engine.",
                failed_code="TRACK_LIST_FAILED",
                failed_message="Failed to read track list via PTSL command.",
                failed_details={"limit": limit, "offset": offset},
            )
            chunk = response.get("track_list") if isinstance(response, dict) else None
            if chunk is None:
                raise PrestoError(
                    "TRACK_LIST_FAILED",
                    "PTSL GetTrackList did not return track_list.",
                    source="runtime",
                    retryable=False,
                    details=self._raw_error_details(
                        "TRACK_LIST_FAILED",
                        "PTSL GetTrackList did not return track_list.",
                        address=self.address,
                        limit=limit,
                        offset=offset,
                        response=response,
                    ),
                    capability="daw.track.list",
                    adapter="pro_tools",
                )
            tracks.extend(list(chunk))
            if len(chunk) < limit:
                break
            offset += limit

        return tracks

    def _import_audio(self, engine: Any, file_paths: list[str], *, convert: bool) -> None:
        session_path = self.ensure_session_open()
        import_type = getattr(pt, "Audio", getattr(pt, "IType_Audio", 2)) if pt is not None else 2
        audio_operation = self._resolve_audio_operation(convert=convert)
        audio_destination = getattr(pt, "MD_NewTrack", 0) if pt is not None else 0
        audio_location = getattr(pt, "ML_SessionStart", 0) if pt is not None else 0
        location_type = getattr(pt, "Start", getattr(pt, "SLType_Start", 0)) if pt is not None else 0
        location_options = getattr(pt, "TimeCode", getattr(pt, "TOOptions_TimeCode", 0)) if pt is not None else 0
        request = {
            "session_path": session_path,
            "import_type": import_type,
            "audio_data": {
                "file_list": list(file_paths),
                "audio_operations": audio_operation,
                "audio_destination": audio_destination,
                "audio_location": audio_location,
                "location_data": {
                    "location_type": location_type,
                    "location_options": location_options,
                    "location_value": "",
                },
            },
        }
        self._run_ptsl_command(
            engine=engine,
            command_name="CId_Import",
            payload=request,
            capability="daw.import.run.start",
            unavailable_code="IMPORT_UNAVAILABLE",
            unavailable_message="Pro Tools import API is unavailable on the current engine.",
            failed_code="IMPORT_FAILED",
            failed_message="Failed to import audio into Pro Tools.",
            failed_details={"file_paths": list(file_paths), "convert": bool(convert)},
        )

    @staticmethod
    def _resolve_audio_operation(*, convert: bool) -> int:
        if pt is None:
            return 0

        candidates = (
            ("AOperations_ConvertAudio", "ConvertAudio")
            if convert
            else ("AOperations_CopyAudio", "CopyAudio")
        )
        for name in candidates:
            if hasattr(pt, name):
                return int(getattr(pt, name))

        requested = "convert" if convert else "copy"
        raise PrestoError(
            "IMPORT_OPTIONS_UNSUPPORTED",
            f"PTSL import {requested} operation is not available in current py-ptsl build.",
            source="runtime",
            retryable=False,
            capability="daw.import.run.start",
            adapter="pro_tools",
        )

    @staticmethod
    def _is_sample_rate_mismatch_error(error: Exception) -> bool:
        message = str(error).lower()
        return "sample rate" in message and "mismatch" in message

    @staticmethod
    def _diff_new_tracks(before: list[str], after: list[str]) -> list[str]:
        remaining = list(before)
        new_tracks: list[str] = []
        for track_name in after:
            if track_name in remaining:
                remaining.remove(track_name)
                continue
            new_tracks.append(track_name)
        return new_tracks

    def _normalize_color_slot(self, color_slot: Any) -> int:
        try:
            slot = int(color_slot)
        except Exception as exc:
            raise PrestoError(
                "INVALID_COLOR_SLOT",
                "Color slot must be an integer.",
                source="capability",
                retryable=False,
                details=self._raw_error_details(
                    "INVALID_COLOR_SLOT",
                    "Color slot must be an integer.",
                    color_slot=color_slot,
                ),
                capability="daw.track.color.apply",
                adapter="pro_tools",
            ) from exc

        if slot < 1:
            raise PrestoError(
                "INVALID_COLOR_SLOT",
                "Color slot must be 1 or greater.",
                source="capability",
                retryable=False,
                details=self._raw_error_details(
                    "INVALID_COLOR_SLOT",
                    "Color slot must be 1 or greater.",
                    color_slot=slot,
                ),
                capability="daw.track.color.apply",
                adapter="pro_tools",
            )

        return slot

    @staticmethod
    def _normalize_bit_depth(bit_depth_value: Any) -> int:
        if bit_depth_value is None:
            return 24

        if hasattr(bit_depth_value, "value"):
            enum_value = getattr(bit_depth_value, "value")
            if isinstance(enum_value, int):
                bit_depth_value = enum_value

        if isinstance(bit_depth_value, (int, float)):
            numeric_value = int(bit_depth_value)
            numeric_mapping = {
                1: 16,
                2: 24,
                3: 32,
                16: 16,
                24: 24,
                32: 32,
            }
            return numeric_mapping.get(numeric_value, 24)

        text = str(bit_depth_value).strip().lower()
        compact = text.replace(" ", "").replace("_", "").replace("-", "")

        if compact in {"1", "16", "16bit", "bit16"}:
            return 16
        if compact in {"2", "24", "24bit", "bit24"}:
            return 24
        if compact in {"3", "32", "32bit", "32float", "32bitfloat", "float32", "bit32float", "bit32"}:
            return 32

        return 24

    @staticmethod
    def _coerce_timeline_selection(selection: Any) -> tuple[str, str]:
        if isinstance(selection, dict):
            return str(selection.get("in_time", "")), str(selection.get("out_time", ""))
        if isinstance(selection, tuple) and len(selection) >= 2:
            return str(selection[0]), str(selection[1])
        if isinstance(selection, list) and len(selection) >= 2:
            return str(selection[0]), str(selection[1])
        return "", ""

    def _posix_directory_to_hfs(self, path: str) -> str:
        return _convert_posix_directory_to_hfs(path)

    def _resolve_export_mix_file_type(self, value: Any, *, capability: str, field: str) -> int:
        normalized = str(value or "").strip().upper().replace(" ", "").replace("-", "").replace("_", "")
        mapping = {
            "WAV": getattr(pt, "EM_WAV", 2),
            "AIFF": getattr(pt, "EM_AIFF", 3),
            "MP3": getattr(pt, "EM_MP3", 4),
            "MOV": getattr(pt, "EM_MOV", 1),
            "WAVADM": getattr(pt, "EM_WAVADM", 6),
        }
        if normalized in mapping:
            return int(mapping[normalized])
        raise PrestoValidationError(
            f"{field} is unsupported.",
            capability=capability,
            details=self._raw_error_details("VALIDATION_ERROR", f"{field} is unsupported.", field=field, value=value),
        )

    def _resolve_export_mix_source_type(self, value: Any, *, capability: str, field: str) -> int:
        normalized = str(value or "").strip().lower().replace("-", "").replace("_", "").replace(" ", "")
        mapping = {
            "physicalout": getattr(pt, "PhysicalOut", getattr(pt, "EMSType_PhysicalOut", 0)),
            "bus": getattr(pt, "Bus", getattr(pt, "EMSType_Bus", 1)),
            "output": getattr(pt, "Output", getattr(pt, "EMSType_Output", 2)),
            "renderer": getattr(pt, "EMSType_Renderer", 4),
        }
        if normalized in mapping:
            return int(mapping[normalized])
        raise PrestoValidationError(
            f"{field} is unsupported.",
            capability=capability,
            details=self._raw_error_details("VALIDATION_ERROR", f"{field} is unsupported.", field=field, value=value),
        )

    def _resolve_export_mix_source_type_name(self, value: Any, *, capability: str, field: str) -> str:
        normalized = str(value or "").strip().lower().replace("-", "").replace("_", "").replace(" ", "")
        if normalized == "physicalout":
            return "EMSType_PhysicalOut"
        if normalized == "bus":
            return "EMSType_Bus"
        if normalized == "output":
            return "EMSType_Output"
        if normalized == "renderer":
            return "EMSType_Renderer"
        raise PrestoValidationError(
            f"{field} is unsupported.",
            capability=capability,
            details=self._raw_error_details("VALIDATION_ERROR", f"{field} is unsupported.", field=field, value=value),
        )

    def _build_export_mix_audio_info(self, payload: dict[str, Any]) -> Any:
        return pt.EM_AudioInfo(
            compression_type=getattr(pt, "CT_PCM", 1),
            export_format=self._resolve_export_format(payload.get("audio_format"), capability="daw.export.start", field="audio.format"),
            bit_depth=self._resolve_bit_depth_enum(payload.get("bit_depth"), capability="daw.export.start", field="audio.bitDepth"),
            sample_rate=self._resolve_sample_rate(payload.get("sample_rate"), capability="daw.export.start", field="audio.sampleRate"),
            pad_to_frame_boundary=self._bool_to_triple_bool(
                payload.get("pad_to_frame_boundary", False),
                capability="daw.export.start",
                field="audio.padToFrameBoundary",
            ),
            delivery_format=self._resolve_delivery_format(
                payload.get("delivery_format", "single_file"),
                capability="daw.export.start",
                field="audio.deliveryFormat",
            ),
        )

    def _build_export_mix_request_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        file_name = self._require_non_empty_text(payload.get("file_name"), field="fileName", capability="daw.export.start")
        output_path = self._require_non_empty_text(payload.get("output_path"), field="outputPath", capability="daw.export.start")
        source_type = payload.get("source_type", "physical_out")
        source_name = self._require_non_empty_text(payload.get("source_name", "Out 1-2"), field="source.name", capability="daw.export.start")
        file_destination = str(payload.get("file_destination", "directory") or "directory").strip().lower().replace("-", "_")

        return {
            "file_name": file_name,
            "file_type": self._resolve_export_mix_file_type(payload.get("file_type"), capability="daw.export.start", field="fileType"),
            "mix_source_list": [
                {
                    "source_type": self._resolve_export_mix_source_type(source_type, capability="daw.export.start", field="source.type"),
                    "name": source_name,
                }
            ],
            "audio_info": self._build_export_mix_audio_payload(payload),
            "video_info": {
                "include_video": self._bool_to_triple_bool(
                    payload.get("include_video", False),
                    capability="daw.export.start",
                    field="video.includeVideo",
                )
            },
            "location_info": self._build_export_mix_location_payload(
                file_destination=file_destination,
                output_path=output_path,
                import_after_bounce=payload.get("import_after_bounce", False),
            ),
            "dolby_atmos_info": {},
            "offline_bounce": self._bool_to_triple_bool(payload.get("offline", True), capability="daw.export.start", field="offline"),
        }

    def _build_export_mix_audio_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        return {
            "compression_type": int(getattr(pt, "CT_PCM", 1)),
            "export_format": self._resolve_export_format(
                payload.get("audio_format", "interleaved"),
                capability="daw.export.start",
                field="audio.format",
            ),
            "bit_depth": self._resolve_bit_depth_enum(
                payload.get("bit_depth", 24),
                capability="daw.export.start",
                field="audio.bitDepth",
            ),
            "sample_rate": self._resolve_sample_rate(
                payload.get("sample_rate", 48000),
                capability="daw.export.start",
                field="audio.sampleRate",
            ),
            "pad_to_frame_boundary": self._bool_to_triple_bool(
                payload.get("pad_to_frame_boundary", False),
                capability="daw.export.start",
                field="audio.padToFrameBoundary",
            ),
            "delivery_format": self._resolve_delivery_format(
                payload.get("delivery_format", "single_file"),
                capability="daw.export.start",
                field="audio.deliveryFormat",
            ),
        }

    def _build_export_mix_location_payload(
        self,
        *,
        file_destination: str,
        output_path: str,
        import_after_bounce: Any,
    ) -> dict[str, Any]:
        if file_destination == "session_folder":
            return {
                "file_destination": int(getattr(pt, "EM_FD_SessionFolder", 2)),
                "import_after_bounce": self._bool_to_triple_bool(
                    import_after_bounce,
                    capability="daw.export.start",
                    field="importAfterBounce",
                ),
            }

        return {
            "file_destination": int(getattr(pt, "EM_FD_Directory", 2)),
            "directory": self._posix_directory_to_hfs(output_path),
            "import_after_bounce": self._bool_to_triple_bool(
                import_after_bounce,
                capability="daw.export.start",
                field="importAfterBounce",
            ),
        }

    def _resolve_export_format(self, value: Any, *, capability: str, field: str) -> int:
        normalized = str(value or "").strip().lower().replace("-", "").replace("_", "").replace(" ", "")
        mapping = {
            "mono": getattr(pt, "EF_Mono", 1),
            "multiplemono": getattr(pt, "EF_MultipleMono", 2),
            "interleaved": getattr(pt, "EF_Interleaved", 3),
        }
        if normalized in mapping:
            return int(mapping[normalized])
        raise PrestoValidationError(
            f"{field} is unsupported.",
            capability=capability,
            details=self._raw_error_details("VALIDATION_ERROR", f"{field} is unsupported.", field=field, value=value),
        )

    def _resolve_bit_depth_enum(self, value: Any, *, capability: str, field: str) -> int:
        normalized = self._normalize_bit_depth(value)
        mapping = {
            16: getattr(pt, "Bit16", 1),
            24: getattr(pt, "Bit24", 2),
            32: getattr(pt, "Bit32Float", 3),
        }
        return int(mapping[normalized])

    def _resolve_sample_rate(self, value: Any, *, capability: str, field: str) -> int:
        try:
            normalized = int(value if value is not None else 48000)
        except Exception as exc:
            raise PrestoValidationError(
                f"{field} is unsupported.",
                capability=capability,
                details=self._raw_error_details("VALIDATION_ERROR", f"{field} is unsupported.", field=field, value=value),
            ) from exc

        mapping = {
            44100: getattr(pt, "SR_44100", 44100),
            48000: getattr(pt, "SR_48000", 48000),
            88200: getattr(pt, "SR_88200", 88200),
            96000: getattr(pt, "SR_96000", 96000),
            176400: getattr(pt, "SR_176400", 176400),
            192000: getattr(pt, "SR_192000", 192000),
        }
        if normalized in mapping:
            return int(mapping[normalized])
        raise PrestoValidationError(
            f"{field} is unsupported.",
            capability=capability,
            details=self._raw_error_details("VALIDATION_ERROR", f"{field} is unsupported.", field=field, value=value),
        )

    def _resolve_delivery_format(self, value: Any, *, capability: str, field: str) -> int:
        normalized = str(value or "").strip().lower().replace("-", "").replace("_", "").replace(" ", "")
        mapping = {
            "singlefile": getattr(pt, "EM_DF_SingleFile", 2),
            "filepermixsource": getattr(pt, "EM_DF_FilePerMixSource", 1),
        }
        if normalized in mapping:
            return int(mapping[normalized])
        raise PrestoValidationError(
            f"{field} is unsupported.",
            capability=capability,
            details=self._raw_error_details("VALIDATION_ERROR", f"{field} is unsupported.", field=field, value=value),
        )

    def _bool_to_triple_bool(self, value: Any, *, capability: str, field: str) -> int:
        if isinstance(value, bool):
            return int(getattr(pt, "TB_True", 2) if value else getattr(pt, "TB_False", 1))
        if value is None:
            return int(getattr(pt, "TB_None", 0))
        raise PrestoValidationError(
            f"{field} must be a boolean.",
            capability=capability,
            details=self._raw_error_details("VALIDATION_ERROR", f"{field} must be a boolean.", field=field, value=value),
        )

    @staticmethod
    def _require_non_empty_text(value: Any, *, field: str, capability: str) -> str:
        text = str(value or "").strip()
        if text:
            return text
        raise PrestoValidationError(
            f"{field} is required.",
            capability=capability,
            details={
                "rawCode": "VALIDATION_ERROR",
                "rawMessage": f"{field} is required.",
                "field": field,
            },
        )

    def _detect_host_version(self, engine: Any) -> str:
        for attr in ("host_version", "version", "pt_version", "server_version"):
            candidate = getattr(engine, attr, None)
            if candidate is None:
                continue
            try:
                value = candidate() if callable(candidate) else candidate
            except Exception:
                continue
            text = str(value or "").strip()
            if text:
                return text
        return ""

    @staticmethod
    def _parse_version_tuple(value: str) -> tuple[int, int] | None:
        text = str(value).strip()
        match = re.search(r"(\d{4})\D+(\d{1,2})", text)
        if not match:
            return None
        return int(match.group(1)), int(match.group(2))

    def _detect_selected_track_names(self, engine: Any) -> list[str]:
        for attr in ("selected_track_names", "get_selected_track_names"):
            if not hasattr(engine, attr):
                continue
            getter = getattr(engine, attr)
            try:
                raw = getter() if callable(getter) else getter
            except Exception:
                continue
            if raw is None:
                continue
            if isinstance(raw, str):
                name = raw.strip()
                return [name] if name else []
            if isinstance(raw, (list, tuple, set)):
                selected = [str(item).strip() for item in raw if str(item).strip()]
                if selected:
                    return selected
                return []

        try:
            tracks = self._read_tracks(engine)
        except PrestoError as exc:
            raise PrestoError(
                "TRACK_SELECTION_CHECK_FAILED",
                str(exc) or "Failed to inspect selected tracks.",
                source="runtime",
                retryable=False,
                details={"exception_type": type(exc).__name__},
                capability="daw.track.color.apply",
                adapter="pro_tools",
            ) from exc

        selected: list[str] = []
        for track in tracks or []:
            attrs = self._record_get(track, "track_attributes")
            if (
                ProToolsDawAdapter._is_selected_track_attribute(self._record_get(attrs, "is_selected"))
                or ProToolsDawAdapter._is_selected_track_attribute(self._record_get(track, "is_selected"))
            ):
                selected.append(str(self._record_get(track, "name", default="")).strip())
        return [name for name in selected if name]

    @staticmethod
    def _is_selected_track_attribute(value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            normalized = value.strip()
            return normalized in {
                "SetExplicitly",
                "SetImplicitly",
                "TAState_SetExplicitly",
                "TAState_SetImplicitly",
            }
        try:
            numeric = int(value)
        except Exception:
            return False
        return numeric in (2, 3)

    @staticmethod
    def _map_track_type(value: Any) -> str:
        if value is None:
            return "audio"

        if isinstance(value, str):
            text = value.lower()
            if "midi" in text:
                return "midi"
            if "aux" in text:
                return "aux"
            if "instrument" in text:
                return "instrument"
            if "master" in text:
                return "master"
            if "voice" in text:
                return "voice"
            if "folder" in text:
                return "folder"
            return "audio"

        try:
            numeric = int(value)
        except Exception:
            return "audio"

        if numeric == 1:
            return "midi"
        if numeric == 3:
            return "aux"
        if numeric == 11:
            return "instrument"
        if numeric == 12:
            return "master"
        return "audio"

    @staticmethod
    def _map_track_format(value: Any) -> str:
        if value is None:
            return "unknown"

        if isinstance(value, str):
            text = value.lower()
            if "stereo" in text:
                return "stereo"
            if "mono" in text:
                return "mono"
            if "lcr" in text:
                return "lcr"
            if "5.1" in text:
                return "5.1"
            return text or "unknown"

        try:
            numeric = int(value)
        except Exception:
            return "unknown"

        if numeric == 1:
            return "mono"
        if numeric == 2:
            return "stereo"
        if numeric == 3:
            return "lcr"
        if numeric == 8:
            return "5.1"
        return "unknown"

    @staticmethod
    def _string_or_empty(value: Any) -> str:
        return str(value).strip() if value is not None else ""

    @staticmethod
    def _string_or_none(value: Any) -> str | None:
        text = str(value).strip() if value is not None else ""
        return text or None

    @staticmethod
    def _record_get(value: Any, *keys: str, default: Any = None) -> Any:
        if value is None:
            return default
        if isinstance(value, dict):
            for key in keys:
                if key in value:
                    return value[key]
            return default
        for key in keys:
            candidate = getattr(value, key, None)
            if candidate is not None:
                return candidate
        return default

    @staticmethod
    def _is_unknown_command_error(exc: Exception) -> bool:
        text = str(exc).lower()
        return "unknown command" in text or "unrecognized command" in text or "command not found" in text

    def _automation_error(
        self,
        exc: MacAutomationError,
        *,
        capability: str,
        fallback_code: str,
        fallback_message: str,
    ) -> PrestoError:
        raw_code = str(exc.code or fallback_code)
        raw_message = str(exc.raw_message or exc.message or fallback_message)
        message = str(exc.message or fallback_message)
        return PrestoError(
            raw_code,
            message,
            source="runtime",
            retryable=bool(exc.retryable),
            details=self._raw_error_details(
                raw_code,
                raw_message,
                address=self.address,
                **(exc.details or {}),
            ),
            capability=capability,
            adapter="pro_tools",
        )

    @staticmethod
    def _raw_error_details(raw_code: str, raw_message: str, **extra: Any) -> dict[str, Any]:
        details: dict[str, Any] = {
            "rawCode": raw_code,
            "rawMessage": raw_message,
        }
        for key, value in extra.items():
            if value is not None:
                details[key] = value
        return details

    def _run_ptsl_command(
        self,
        *,
        command_name: str,
        payload: dict[str, Any],
        capability: str,
        unavailable_code: str,
        unavailable_message: str,
        failed_code: str,
        failed_message: str,
        engine: Any | None = None,
        minimum_host_version: str | None = None,
        failed_details: dict[str, Any] | None = None,
    ) -> Any:
        resolved_engine = engine or self._require_engine()
        try:
            return self._ptsl_runner.run(
                resolved_engine,
                command_name,
                payload,
                capability=capability,
                minimum_host_version=minimum_host_version,
            )
        except PrestoError as exc:
            if exc.code in {"PTSL_CLIENT_UNAVAILABLE", "PTSL_COMMAND_UNAVAILABLE", "PTSL_NOT_INSTALLED", "PTSL_SCHEMA_UNAVAILABLE"}:
                raise PrestoError(
                    unavailable_code,
                    unavailable_message,
                    source="runtime",
                    retryable=False,
                    details=self._raw_error_details(
                        unavailable_code,
                        unavailable_message,
                        address=self.address,
                        command_name=command_name,
                    ),
                    capability=capability,
                    adapter="pro_tools",
                ) from exc

            details = dict(failed_details or {})
            details.setdefault("command_name", command_name)
            raise PrestoError(
                failed_code,
                str(exc) or failed_message,
                source="runtime",
                retryable=False,
                details=self._raw_error_details(
                    failed_code,
                    str(exc) or failed_message,
                    address=self.address,
                    **details,
                    raw_exception=str(exc) or None,
                ),
                capability=capability,
                adapter="pro_tools",
            ) from exc

    @staticmethod
    def _serialize_ptsl_command_entry(entry: PtslCommandCatalogEntry) -> dict[str, Any]:
        return {
            "commandName": entry.command_name,
            "commandId": entry.command_id,
            "requestMessage": entry.request_message,
            "responseMessage": entry.response_message,
            "hasPyPtslOp": entry.has_py_ptsl_op,
            "category": entry.category,
            "introducedVersion": entry.introduced_version,
        }

    def _set_track_toggle_state_batch(
        self,
        *,
        capability: str,
        command_name: str,
        track_names: list[str],
        enabled: bool,
        unavailable_code: str,
        unavailable_message: str,
        failed_code: str,
        failed_message: str,
    ) -> None:
        engine = self._require_engine()
        self.ensure_session_open()
        normalized_track_names = [str(track_name).strip() for track_name in track_names if str(track_name).strip()]
        if not normalized_track_names:
            raise PrestoError(
                "TRACK_NAME_REQUIRED",
                "At least one track name is required before updating track state.",
                source="capability",
                retryable=False,
                details=self._raw_error_details(
                    "TRACK_NAME_REQUIRED",
                    "At least one track name is required before updating track state.",
                ),
                capability=capability,
                adapter="pro_tools",
            )

        if command_name == "CId_SetTrackOnlineState":
            for track_name in normalized_track_names:
                self._run_ptsl_command(
                    engine=engine,
                    command_name=command_name,
                    payload={"track_name": track_name, "enabled": bool(enabled)},
                    capability=capability,
                    unavailable_code=unavailable_code,
                    unavailable_message=unavailable_message,
                    failed_code=failed_code,
                    failed_message=failed_message,
                    failed_details={"track_name": track_name, "enabled": bool(enabled)},
                )
            return

        self._run_ptsl_command(
            engine=engine,
            command_name=command_name,
            payload={"track_names": normalized_track_names, "enabled": bool(enabled)},
            capability=capability,
            unavailable_code=unavailable_code,
            unavailable_message=unavailable_message,
            failed_code=failed_code,
            failed_message=failed_message,
            failed_details={"track_names": normalized_track_names, "enabled": bool(enabled)},
        )

    @staticmethod
    def _read_track_color_success_count(response: Any) -> int | None:
        if isinstance(response, dict):
            value = response.get("success_count")
        else:
            # For non-dict responses, only an explicit success_count confirms success.
            value = getattr(response, "success_count", None)

        if value is None:
            return None

        try:
            return int(value)
        except Exception:
            return None

    @staticmethod
    def _split_address(address: str) -> tuple[str, int]:
        host, _, port_text = address.rpartition(":")
        if host and port_text.isdigit():
            return host, int(port_text)
        return address, 31416

    def _run_transport_command(
        self,
        command_name: str,
        request: dict[str, Any],
        *,
        capability_id: str,
    ) -> Any:
        return self._run_ptsl_command(
            command_name=command_name,
            payload=request,
            capability=capability_id,
            unavailable_code="TRANSPORT_COMMAND_UNAVAILABLE",
            unavailable_message=f"The current Pro Tools engine cannot run {command_name}.",
            failed_code="TRANSPORT_COMMAND_FAILED",
            failed_message=f"Failed to run {command_name}.",
            failed_details={"request": request},
        )

    def _read_transport_state(self, response: Any) -> str:
        raw_state = None
        if isinstance(response, dict):
            raw_state = response.get("current_setting")
        else:
            raw_state = getattr(response, "current_setting", None)
            if raw_state is None and hasattr(response, "transport"):
                raw_state = getattr(response.transport, "current_setting", None)

        if hasattr(raw_state, "name"):
            raw_state = getattr(raw_state, "name")
        if hasattr(raw_state, "value") and isinstance(getattr(raw_state, "value"), int):
            raw_state = getattr(raw_state, "value")

        if isinstance(raw_state, int):
            if raw_state == getattr(pt, "TS_TransportPlaying", 0):
                return "playing"
            if raw_state == getattr(pt, "TS_TransportRecording", 2):
                return "recording"
            if raw_state == getattr(pt, "TS_TransportStopped", 1):
                return "stopped"
            if raw_state in (
                getattr(pt, "TS_TransportPlayingHalfSpeed", -1),
                getattr(pt, "TS_TransportFastForward", -1),
            ):
                return "playing"
            if raw_state in (
                getattr(pt, "TS_TransportRecordingHalfSpeed", -1),
            ):
                return "recording"
            return "stopped"

        text = str(raw_state or "").strip().lower()
        if "record" in text:
            return "recording"
        if "play" in text:
            return "playing"
        return "stopped"
