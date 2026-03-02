"""PTSL gateway wrapping py-ptsl operations."""

from __future__ import annotations

from collections import Counter
from pathlib import Path
import re

from presto.domain.errors import GatewayError
from presto.domain.export_models import ExportFileMeta, SessionInfoLite, TrackStateLite
from presto.domain.pt_color_palette import clamp_color_slot

try:
    from ptsl import Engine, PTSL_pb2 as pt, ops
except Exception:  # pragma: no cover - evaluated at runtime environment
    Engine = None  # type: ignore[assignment]
    pt = None  # type: ignore[assignment]
    ops = None  # type: ignore[assignment]


class ProToolsGateway:
    """Encapsulates PTSL operations used by the app."""

    DEFAULT_SET_TRACK_COLOR_COMMAND_ID = 153

    def __init__(
        self,
        company_name: str = "Presto",
        application_name: str = "Presto",
        address: str = "localhost:31416",
    ) -> None:
        self.company_name = company_name
        self.application_name = application_name
        self.address = address
        self._engine = None
        self._set_track_color_command_id = self._resolve_set_track_color_command_id()
        self._export_cancelled = False

    def connect(self) -> None:
        """Connect and verify host readiness."""

        if self._engine is not None:
            return

        if Engine is None:
            raise GatewayError("PTSL_NOT_INSTALLED", "py-ptsl is not available in this environment.")

        try:
            self._engine = Engine(
                company_name=self.company_name,
                application_name=self.application_name,
                address=self.address,
            )
            self._engine.host_ready_check()
        except Exception as exc:
            self._engine = None
            raise GatewayError("PTSL_CONNECT_FAILED", str(exc)) from exc

    def close(self) -> None:
        """Close current engine connection."""

        if self._engine is None:
            return
        try:
            self._engine.close()
        finally:
            self._engine = None

    def ensure_session_open(self) -> str:
        """Return active session path; raise if none is open."""

        engine = self._require_engine()
        try:
            op = ops.GetSessionPath()
            engine.client.run(op)
            session_path = getattr(getattr(op.response, "session_path", None), "path", "")
            if not session_path:
                raise GatewayError("NO_OPEN_SESSION", "No open Pro Tools session found.")
            return session_path
        except GatewayError:
            raise
        except Exception as exc:
            raise GatewayError("SESSION_CHECK_FAILED", str(exc)) from exc

    def get_session_info(self) -> SessionInfoLite:
        """Fetch lightweight session metadata for export workflow."""

        engine = self._require_engine()
        try:
            session_name = str(engine.session_name() or "")
            session_path = str(engine.session_path() or "")
            if not session_path:
                raise GatewayError("EXPORT_NO_SESSION", "No open Pro Tools session found.")
            sample_rate = int(engine.session_sample_rate() or 48000)
            bit_depth = self._normalize_bit_depth(engine.session_bit_depth())
            return SessionInfoLite(
                session_name=session_name,
                session_path=session_path,
                sample_rate=sample_rate,
                bit_depth=bit_depth,
            )
        except GatewayError:
            raise
        except Exception as exc:
            raise GatewayError("SESSION_CHECK_FAILED", str(exc)) from exc

    def ensure_track_color_supported(self) -> None:
        """Validate that the connected PTSL build supports track color command."""

        engine = self._require_engine()
        if not hasattr(engine, "client") or not hasattr(engine.client, "run_command"):
            raise GatewayError(
                "PTSL_COLOR_UNSUPPORTED",
                (
                    "Current py-ptsl engine does not expose run_command API required for SetTrackColor. "
                    "Track color via official PTSL command is unavailable."
                ),
            )

        # Probe command id against host with an empty target list (no side effect).
        # If command id is unknown, host/server will return unknown-command style error.
        try:
            engine.client.run_command(
                command_id=int(self._set_track_color_command_id),
                request={"track_names": [], "color_index": 1},
            )
        except Exception as exc:
            if self._is_unknown_command_error(exc):
                raise GatewayError(
                    "PTSL_COLOR_UNSUPPORTED",
                    (
                        "Connected Pro Tools/PTSL host does not support SetTrackColor "
                        f"(command id {self._set_track_color_command_id}). "
                        "Requires Pro Tools/PTSL 2025.10+."
                    ),
                ) from exc
            # Other errors (e.g., invalid args/no tracks) indicate command exists.

    def list_track_names(self) -> list[str]:
        """List current track names."""

        engine = self._require_engine()
        limit = 1000
        offset = 0
        names: list[str] = []

        try:
            while True:
                op = ops.GetTrackList(
                    page_limit=limit,
                    pagination_request=pt.PaginationRequest(limit=limit, offset=offset),
                )
                engine.client.run(op)
                chunk = [track.name for track in op.track_list]
                names.extend(chunk)
                if len(chunk) < limit:
                    break
                offset += limit
        except Exception as exc:
            raise GatewayError("TRACK_LIST_FAILED", str(exc)) from exc

        return names

    def list_tracks(self) -> list[TrackStateLite]:
        """List tracks with solo/mute states for export snapshot."""

        engine = self._require_engine()
        try:
            tracks = engine.track_list()
        except Exception as exc:
            raise GatewayError("TRACK_LIST_FAILED", str(exc)) from exc

        result: list[TrackStateLite] = []
        for track in tracks:
            attrs = getattr(track, "track_attributes", None)
            result.append(
                TrackStateLite(
                    track_id=str(getattr(track, "id", "")),
                    track_name=str(getattr(track, "name", "")),
                    track_type=self._map_track_type(getattr(track, "type", None)),
                    is_soloed=bool(getattr(attrs, "is_soloed", False)),
                    is_muted=bool(getattr(attrs, "is_muted", False)),
                    color=(None if not getattr(track, "color", None) else str(getattr(track, "color"))),
                )
            )
        return result

    def import_audio_file(self, path: str) -> str:
        """Import one file and return detected new track name.

        Uses copy-import first, then auto-falls back to sample-rate conversion
        when Pro Tools reports a sample-rate mismatch.
        """

        engine = self._require_engine()
        file_path = str(Path(path).expanduser().resolve())

        before = self.list_track_names()
        try:
            self._import_audio(
                engine=engine,
                file_path=file_path,
                audio_operation=self._resolve_audio_operation(convert=False),
            )
        except Exception as exc:
            if not self._is_sample_rate_mismatch_error(exc):
                raise GatewayError("IMPORT_FAILED", str(exc)) from exc
            try:
                self._import_audio(
                    engine=engine,
                    file_path=file_path,
                    audio_operation=self._resolve_audio_operation(convert=True),
                )
            except Exception as convert_exc:
                raise GatewayError(
                    "IMPORT_FAILED",
                    (
                        "Sample rate mismatch detected and automatic sample-rate conversion failed: "
                        f"{convert_exc}"
                    ),
                ) from convert_exc

        after = self.list_track_names()
        new_tracks = self._diff_new_tracks(before, after)
        if not new_tracks:
            raise GatewayError(
                "TRACK_DETECTION_FAILED",
                "Import succeeded but no new track was detected.",
            )
        return new_tracks[-1]

    def rename_track(self, current_name: str, new_name: str) -> None:
        """Rename track."""

        engine = self._require_engine()
        try:
            engine.rename_target_track(current_name, new_name)
        except Exception as exc:
            raise GatewayError("RENAME_TRACK_FAILED", str(exc)) from exc

    def select_track(self, name: str) -> None:
        """Select a track by name."""

        engine = self._require_engine()
        try:
            engine.select_tracks_by_name([name])
        except Exception as exc:
            raise GatewayError("SELECT_TRACK_FAILED", str(exc)) from exc

    def apply_track_color(self, slot: int, track_name: str) -> None:
        """Apply track color through PTSL command (no UI automation)."""

        engine = self._require_engine()
        normalized_slot = clamp_color_slot(slot)

        try:
            response = engine.client.run_command(
                command_id=int(self._set_track_color_command_id),
                request={
                    "track_names": [track_name],
                    "color_index": int(normalized_slot),
                },
            )
        except Exception as exc:
            if self._is_unknown_command_error(exc):
                raise GatewayError(
                    "PTSL_COLOR_UNSUPPORTED",
                    (
                        "Connected Pro Tools/PTSL host does not support SetTrackColor "
                        f"(command id {self._set_track_color_command_id}). "
                        "Requires Pro Tools/PTSL 2025.10+."
                    ),
                ) from exc
            raise GatewayError("SET_TRACK_COLOR_FAILED", str(exc)) from exc

        if isinstance(response, dict):
            success_count = int(response.get("success_count", 1))
            if success_count < 1:
                raise GatewayError(
                    "SET_TRACK_COLOR_FAILED",
                    f"SetTrackColor completed but success_count={success_count} for track '{track_name}'.",
                )

    def select_all_clips_on_track(self, name: str) -> None:
        """Select all clips on target track."""

        engine = self._require_engine()
        try:
            engine.select_all_clips_on_track(name)
        except Exception as exc:
            raise GatewayError("SELECT_CLIPS_FAILED", str(exc)) from exc

    def save_session(self) -> None:
        """Save open session."""

        engine = self._require_engine()
        try:
            engine.save_session()
        except Exception as exc:
            raise GatewayError("SAVE_SESSION_FAILED", str(exc)) from exc

    def set_track_mute_state(self, track_names: list[str], enabled: bool) -> None:
        """Set mute state using official PTSL command."""

        if not track_names:
            return
        engine = self._require_engine()
        try:
            command_id = self._resolve_command_id("SetTrackMuteState")
            engine.client.run_command(
                command_id=command_id,
                request={"track_names": list(track_names), "enabled": bool(enabled)},
            )
        except Exception as exc:
            raise GatewayError("EXPORT_APPLY_SNAPSHOT_FAILED", str(exc)) from exc

    def set_track_solo_state(self, track_names: list[str], enabled: bool) -> None:
        """Set solo state using official PTSL command."""

        if not track_names:
            return
        engine = self._require_engine()
        try:
            command_id = self._resolve_command_id("SetTrackSoloState")
            engine.client.run_command(
                command_id=command_id,
                request={"track_names": list(track_names), "enabled": bool(enabled)},
            )
        except Exception as exc:
            raise GatewayError("EXPORT_APPLY_SNAPSHOT_FAILED", str(exc)) from exc

    def set_bounce_range(self, start_time: float | None, end_time: float | None) -> None:
        """Set timeline selection used by export mix."""

        engine = self._require_engine()
        try:
            start = float(start_time) if start_time is not None else 0.0
            if end_time is None:
                if hasattr(engine, "session_length"):
                    end = float(engine.session_length())
                else:
                    end = start + 3600.0
            else:
                end = float(end_time)
            if end <= start:
                raise GatewayError("EXPORT_OUTPUT_PATH_INVALID", "Invalid export range: end must be greater than start.")
            engine.set_timeline_selection(start=start, end=end)
        except GatewayError:
            raise
        except Exception as exc:
            raise GatewayError("EXPORT_BOUNCE_FAILED", f"Failed to set bounce range: {exc}") from exc

    def cancel_export(self) -> None:
        """Signal export cancellation for cooperative stop."""

        self._export_cancelled = True

    def export_mix_with_source(
        self,
        output_path: str,
        source_name: str,
        source_type: str,
        file_format: str,
        offline_bounce: bool,
    ) -> ExportFileMeta:
        """Run export_mix using source selection and session destination."""

        engine = self._require_engine()
        self._export_cancelled = False

        normalized_format = str(file_format).strip().lower()
        if normalized_format not in {"wav", "aiff"}:
            raise GatewayError("EXPORT_SOURCE_INVALID", f"Unsupported format '{file_format}'.")

        output_file = Path(output_path).expanduser().resolve()
        output_file.parent.mkdir(parents=True, exist_ok=True)

        if self._export_cancelled:
            return ExportFileMeta(
                success=False,
                output_path=str(output_file),
                file_size=None,
                sample_rate=None,
                bit_depth=None,
                file_format=normalized_format,  # type: ignore[arg-type]
                cancelled=True,
                error_message="Export cancelled.",
            )

        try:
            session = self.get_session_info()
            source_info = self._create_source_info(source_name=source_name, source_type=source_type)
            audio_info = self._create_audio_info(session.sample_rate, session.bit_depth)
            video_info = pt.EM_VideoInfo()
            video_info.include_video = pt.TripleBool.TB_False
            location_info = self._create_location_info(str(output_file))
            dolby_info = pt.EM_DolbyAtmosInfo()
            export_file_type = self._resolve_file_type(normalized_format)
            base_name = output_file.stem
            offline_flag = pt.TripleBool.TB_True if offline_bounce else pt.TripleBool.TB_False

            engine.export_mix(
                base_name=base_name,
                file_type=export_file_type,
                sources=[source_info],
                audio_info=audio_info,
                video_info=video_info,
                location_info=location_info,
                dolby_atmos_info=dolby_info,
                offline_bounce=offline_flag,
            )

            if self._export_cancelled:
                if output_file.exists():
                    try:
                        output_file.unlink()
                    except Exception:
                        pass
                return ExportFileMeta(
                    success=False,
                    output_path=str(output_file),
                    file_size=None,
                    sample_rate=session.sample_rate,
                    bit_depth=session.bit_depth,
                    file_format=normalized_format,  # type: ignore[arg-type]
                    cancelled=True,
                    error_message="Export cancelled.",
                )

            if not output_file.exists():
                raise GatewayError("EXPORT_BOUNCE_FAILED", f"Export file not created: {output_file}")

            return ExportFileMeta(
                success=True,
                output_path=str(output_file),
                file_size=int(output_file.stat().st_size),
                sample_rate=session.sample_rate,
                bit_depth=session.bit_depth,
                file_format=normalized_format,  # type: ignore[arg-type]
                cancelled=False,
                error_message=None,
            )
        except GatewayError:
            raise
        except Exception as exc:
            raise GatewayError("EXPORT_BOUNCE_FAILED", str(exc)) from exc

    def _require_engine(self):
        if self._engine is None:
            raise GatewayError("NOT_CONNECTED", "Pro Tools is not connected.")
        return self._engine

    def _import_audio(self, engine, file_path: str, audio_operation: int) -> None:
        engine.import_audio(
            file_list=[file_path],
            audio_operations=audio_operation,
            audio_destination=pt.MD_NewTrack,
            audio_location=pt.ML_SessionStart,
            timecode="",
        )

    @staticmethod
    def _resolve_audio_operation(convert: bool) -> int:
        if pt is None:
            raise GatewayError("PTSL_NOT_INSTALLED", "py-ptsl is not available in this environment.")

        candidates = (
            ("AOperations_ConvertAudio", "ConvertAudio")
            if convert
            else ("AOperations_CopyAudio", "CopyAudio")
        )
        for name in candidates:
            if hasattr(pt, name):
                return int(getattr(pt, name))

        requested = "convert" if convert else "copy"
        raise GatewayError(
            "IMPORT_OPTIONS_UNSUPPORTED",
            f"PTSL import {requested} operation is not available in current py-ptsl build.",
        )

    @staticmethod
    def _resolve_command_id(name: str) -> int:
        if pt is None:
            raise GatewayError("PTSL_NOT_INSTALLED", "py-ptsl is not available in this environment.")
        if hasattr(pt, "CommandId") and hasattr(pt.CommandId, name):
            return int(getattr(pt.CommandId, name))
        if hasattr(pt, name):
            return int(getattr(pt, name))
        raise GatewayError("PTSL_CONNECT_FAILED", f"PTSL command id '{name}' not found.")

    @classmethod
    def _resolve_set_track_color_command_id(cls) -> int:
        if pt is not None and hasattr(pt, "CId_SetTrackColor"):
            return int(getattr(pt, "CId_SetTrackColor"))

        workspace_root = Path(__file__).resolve().parents[2]
        for proto_path in sorted(workspace_root.glob("PTSL_SDK_CPP.*/Source/PTSL.proto")):
            parsed = cls._parse_set_track_color_command_id(proto_path)
            if parsed is not None:
                return parsed

        return cls.DEFAULT_SET_TRACK_COLOR_COMMAND_ID

    @staticmethod
    def _parse_set_track_color_command_id(proto_path: Path) -> int | None:
        try:
            text = proto_path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            return None

        match = re.search(r"\bCId_SetTrackColor\s*=\s*(\d+)\s*;", text)
        if not match:
            return None
        return int(match.group(1))

    @staticmethod
    def _is_unknown_command_error(exc: Exception) -> bool:
        message = str(exc).lower()
        for needle in ("unknown command", "unsupported command", "invalid command", "command not found"):
            if needle in message:
                return True

        error_name = str(getattr(exc, "error_name", "") or "").lower()
        if "unknown" in error_name and "command" in error_name:
            return True
        return False

    @staticmethod
    def _is_sample_rate_mismatch_error(exc: Exception) -> bool:
        message = str(exc).lower()
        for needle in (
            "sample rate mismatch",
            "pt_sampleratemismatch",
            "pt_sample_rate_mismatch",
            "sample rate does not match",
        ):
            if needle in message:
                return True
        return False

    @staticmethod
    def _diff_new_tracks(before: list[str], after: list[str]) -> list[str]:
        before_counts = Counter(before)
        new_tracks: list[str] = []
        for track_name in after:
            if before_counts[track_name] > 0:
                before_counts[track_name] -= 1
            else:
                new_tracks.append(track_name)
        return new_tracks

    @staticmethod
    def _normalize_bit_depth(value) -> int:
        if value is None:
            return 24
        if hasattr(value, "value"):
            enum_value = getattr(value, "value")
            if isinstance(enum_value, int):
                value = enum_value
        if isinstance(value, (int, float)):
            normalized = int(value)
            mapping = {1: 16, 2: 24, 3: 32, 16: 16, 24: 24, 32: 32}
            return mapping.get(normalized, 24)

        text = str(value).strip().lower().replace(" ", "").replace("_", "").replace("-", "")
        if text in {"16", "16bit", "bit16"}:
            return 16
        if text in {"24", "24bit", "bit24"}:
            return 24
        if text in {"32", "32float", "32bitfloat", "bit32", "bit32float"}:
            return 32
        return 24

    @staticmethod
    def _map_track_type(track_type) -> str:
        if track_type is None:
            return "audio"
        raw = str(track_type)
        numeric = int(track_type) if hasattr(track_type, "__int__") else None
        if numeric == 1 or "Midi" in raw or "TT_Midi" in raw:
            return "midi"
        if numeric == 3 or "Aux" in raw or "TT_Aux" in raw:
            return "aux"
        if numeric == 11 or "Instrument" in raw or "TT_Instrument" in raw:
            return "instrument"
        if numeric == 12 or "Master" in raw or "TT_Master" in raw:
            return "master"
        return "audio"

    @staticmethod
    def _resolve_file_type(file_format: str):
        if file_format == "wav":
            return pt.EM_FileType.EM_WAV
        return pt.EM_FileType.EM_AIFF

    @staticmethod
    def _create_source_info(source_name: str, source_type: str):
        info = pt.EM_SourceInfo()
        info.name = source_name
        mapped = source_type.strip().lower()
        if mapped == "physicalout":
            info.source_type = pt.EM_SourceType.PhysicalOut
        elif mapped == "bus":
            info.source_type = pt.EM_SourceType.Bus
        else:
            info.source_type = pt.EM_SourceType.Output
        return info

    @staticmethod
    def _create_audio_info(sample_rate: int, bit_depth: int):
        info = pt.EM_AudioInfo()
        if sample_rate == 44100:
            info.sample_rate = pt.SampleRate.SR_44100
        elif sample_rate == 48000:
            info.sample_rate = pt.SampleRate.SR_48000
        elif sample_rate == 96000:
            info.sample_rate = pt.SampleRate.SR_96000
        elif sample_rate == 192000:
            info.sample_rate = pt.SampleRate.SR_192000
        else:
            info.sample_rate = pt.SampleRate.SR_48000

        normalized_depth = ProToolsGateway._normalize_bit_depth(bit_depth)
        if normalized_depth == 16:
            info.bit_depth = pt.BitDepth.Bit16
        elif normalized_depth == 24:
            info.bit_depth = pt.BitDepth.Bit24
        elif normalized_depth == 32:
            info.bit_depth = pt.BitDepth.Bit32Float
        else:
            info.bit_depth = pt.BitDepth.Bit24

        info.export_format = pt.ExportFormat.EF_Interleaved
        info.compression_type = pt.CompressionType.CT_PCM
        return info

    @staticmethod
    def _create_location_info(output_path: str):
        info = pt.EM_LocationInfo()
        info.file_destination = pt.EM_FileDestination.EM_FD_SessionFolder
        info.import_after_bounce = pt.TripleBool.TB_False
        Path(output_path).parent.mkdir(parents=True, exist_ok=True)
        return info
