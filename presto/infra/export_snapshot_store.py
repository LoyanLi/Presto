"""Snapshot persistence for export workflow."""

from __future__ import annotations

import json
from pathlib import Path

from presto.domain.errors import ValidationError
from presto.domain.export_models import ExportSnapshot, ExportTrackState


class ExportSnapshotStore:
    """Persist snapshots in Pro Tools session folder."""

    SNAPSHOT_DIR_NAME = "snapshots"
    SNAPSHOT_FILE_NAME = "snapshots.json"

    def snapshot_file_path(self, session_path: str) -> Path:
        session_file = Path(session_path).expanduser().resolve()
        session_dir = session_file.parent
        return session_dir / self.SNAPSHOT_DIR_NAME / self.SNAPSHOT_FILE_NAME

    def load(self, session_path: str) -> list[ExportSnapshot]:
        file_path = self.snapshot_file_path(session_path)
        if not file_path.exists():
            return []

        try:
            raw = json.loads(file_path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise ValidationError(
                "EXPORT_SNAPSHOT_IO_FAILED",
                f"Failed to read snapshot file: {exc}",
            ) from exc

        if not isinstance(raw, list):
            raise ValidationError("EXPORT_SNAPSHOT_IO_FAILED", "Snapshot file must contain a JSON array.")

        snapshots: list[ExportSnapshot] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            track_raw = item.get("trackStates") or item.get("track_states") or []
            tracks: list[ExportTrackState] = []
            for track in track_raw:
                if not isinstance(track, dict):
                    continue
                tracks.append(
                    ExportTrackState(
                        track_id=str(track.get("trackId") or track.get("track_id") or ""),
                        track_name=str(track.get("trackName") or track.get("track_name") or ""),
                        is_soloed=bool(track.get("is_soloed", False)),
                        is_muted=bool(track.get("is_muted", False)),
                        track_type=str(track.get("type") or track.get("track_type") or "audio"),
                        color=(None if track.get("color") in (None, "") else str(track.get("color"))),
                    )
                )
            snapshots.append(
                ExportSnapshot(
                    id=str(item.get("id") or ""),
                    name=str(item.get("name") or ""),
                    track_states=tracks,
                    created_at=str(item.get("createdAt") or item.get("created_at") or ""),
                    updated_at=(
                        None
                        if item.get("updatedAt") in (None, "")
                        else str(item.get("updatedAt"))
                    ),
                )
            )

        return snapshots

    def save(self, session_path: str, snapshots: list[ExportSnapshot]) -> None:
        file_path = self.snapshot_file_path(session_path)
        file_path.parent.mkdir(parents=True, exist_ok=True)

        payload: list[dict] = []
        for snapshot in snapshots:
            payload.append(
                {
                    "id": snapshot.id,
                    "name": snapshot.name,
                    "trackStates": [
                        {
                            "trackId": track.track_id,
                            "trackName": track.track_name,
                            "is_soloed": track.is_soloed,
                            "is_muted": track.is_muted,
                            "type": track.track_type,
                            "color": track.color,
                        }
                        for track in snapshot.track_states
                    ],
                    "createdAt": snapshot.created_at,
                    "updatedAt": snapshot.updated_at,
                }
            )

        try:
            file_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception as exc:
            raise ValidationError(
                "EXPORT_SNAPSHOT_IO_FAILED",
                f"Failed to write snapshot file: {exc}",
            ) from exc
