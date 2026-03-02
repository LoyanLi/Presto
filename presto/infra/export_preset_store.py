"""Preset persistence for export workflow."""

from __future__ import annotations

import json
from dataclasses import replace
from datetime import datetime
from pathlib import Path
import uuid

from presto.domain.errors import ValidationError
from presto.domain.export_models import ExportAudioFormat, ExportMixSourceType, ExportPreset


class ExportPresetStore:
    """Persist export presets in user's Documents folder."""

    PRESET_DIR_NAME = "Tracktodo"
    PRESET_FILE_NAME = "presets.json"

    def preset_file_path(self) -> Path:
        return Path.home() / "Documents" / self.PRESET_DIR_NAME / self.PRESET_FILE_NAME

    def load(self) -> list[ExportPreset]:
        file_path = self.preset_file_path()
        if not file_path.exists():
            return []

        try:
            raw = json.loads(file_path.read_text(encoding="utf-8"))
        except Exception as exc:
            raise ValidationError("EXPORT_PRESET_IO_FAILED", f"Failed to read preset file: {exc}") from exc

        if not isinstance(raw, list):
            raise ValidationError("EXPORT_PRESET_IO_FAILED", "Preset file must contain a JSON array.")

        presets: list[ExportPreset] = []
        for item in raw:
            if not isinstance(item, dict):
                continue
            file_format = str(item.get("file_format") or "wav").lower()
            mix_source_type = str(item.get("mix_source_type") or "PhysicalOut")
            if file_format not in {"wav", "aiff"}:
                file_format = "wav"
            if mix_source_type not in {"PhysicalOut", "Bus", "Output"}:
                mix_source_type = "PhysicalOut"
            presets.append(
                ExportPreset(
                    id=str(item.get("id") or ""),
                    name=str(item.get("name") or ""),
                    file_format=file_format,  # type: ignore[arg-type]
                    mix_source_name=str(item.get("mix_source_name") or ""),
                    mix_source_type=mix_source_type,  # type: ignore[arg-type]
                    created_at=str(item.get("createdAt") or item.get("created_at") or ""),
                    updated_at=(
                        None
                        if item.get("updatedAt") in (None, "")
                        else str(item.get("updatedAt"))
                    ),
                )
            )
        return presets

    def save(self, presets: list[ExportPreset]) -> None:
        file_path = self.preset_file_path()
        file_path.parent.mkdir(parents=True, exist_ok=True)

        payload = []
        for preset in presets:
            payload.append(
                {
                    "id": preset.id,
                    "name": preset.name,
                    "file_format": preset.file_format,
                    "mix_source_name": preset.mix_source_name,
                    "mix_source_type": preset.mix_source_type,
                    "createdAt": preset.created_at,
                    "updatedAt": preset.updated_at,
                }
            )
        try:
            file_path.write_text(
                json.dumps(payload, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
        except Exception as exc:
            raise ValidationError("EXPORT_PRESET_IO_FAILED", f"Failed to write preset file: {exc}") from exc

    def create(
        self,
        name: str,
        file_format: ExportAudioFormat,
        mix_source_name: str,
        mix_source_type: ExportMixSourceType,
    ) -> ExportPreset:
        presets = self.load()
        self._ensure_unique_name(name, presets)

        now = datetime.now().isoformat()
        preset = ExportPreset(
            id=f"preset_{uuid.uuid4().hex[:12]}",
            name=name,
            file_format=file_format,
            mix_source_name=mix_source_name,
            mix_source_type=mix_source_type,
            created_at=now,
            updated_at=now,
        )
        presets.append(preset)
        self.save(presets)
        return preset

    def update_name(self, preset_id: str, new_name: str) -> ExportPreset:
        presets = self.load()
        self._ensure_unique_name(new_name, presets, exclude_id=preset_id)
        for idx, preset in enumerate(presets):
            if preset.id != preset_id:
                continue
            updated = replace(preset, name=new_name, updated_at=datetime.now().isoformat())
            presets[idx] = updated
            self.save(presets)
            return updated
        raise ValidationError("EXPORT_PRESET_IO_FAILED", "Preset not found.")

    def delete(self, preset_id: str) -> None:
        presets = self.load()
        updated = [preset for preset in presets if preset.id != preset_id]
        self.save(updated)

    @staticmethod
    def _ensure_unique_name(name: str, presets: list[ExportPreset], exclude_id: str | None = None) -> None:
        target = name.strip().lower()
        for preset in presets:
            if exclude_id and preset.id == exclude_id:
                continue
            if preset.name.strip().lower() == target:
                raise ValidationError(
                    "EXPORT_PRESET_IO_FAILED",
                    f"Preset name '{name}' already exists.",
                )

