"""JSON config store under ~/Library/Application Support/Presto."""

from __future__ import annotations

import json
from dataclasses import asdict
from pathlib import Path

from presto.config.defaults import CONFIG_VERSION, default_config
from presto.domain.models import (
    AiNamingConfig,
    AppConfig,
    CategoryTemplate,
    SilenceProfile,
    UiPreferences,
)
from presto.domain.pt_color_palette import clamp_color_slot, palette_hex_for_slot


class ConfigStore:
    """Load/save app config with basic migration support."""

    def __init__(self, app_support_dir: Path | None = None) -> None:
        self.app_support_dir = (
            app_support_dir
            if app_support_dir is not None
            else Path.home() / "Library" / "Application Support" / "Presto"
        )
        self.config_path = self.app_support_dir / "config.json"
        self.logs_dir = self.app_support_dir / "logs"

    def ensure_dirs(self) -> None:
        self.app_support_dir.mkdir(parents=True, exist_ok=True)
        self.logs_dir.mkdir(parents=True, exist_ok=True)

    def load(self) -> AppConfig:
        self.ensure_dirs()
        if not self.config_path.exists():
            config = default_config()
            self.save(config)
            return config

        with self.config_path.open("r", encoding="utf-8") as fp:
            raw = json.load(fp)

        return self._from_raw(raw)

    def save(self, config: AppConfig) -> None:
        self.ensure_dirs()
        normalized_categories = [
            CategoryTemplate(
                id=category.id,
                name=category.name,
                pt_color_slot=clamp_color_slot(category.pt_color_slot),
                preview_hex=palette_hex_for_slot(category.pt_color_slot),
            )
            for category in config.categories
        ]
        payload = {
            "version": config.version,
            "categories": [asdict(category) for category in normalized_categories],
            "silence_profile": asdict(config.silence_profile),
            "ai_naming": asdict(config.ai_naming),
            "ui_preferences": asdict(config.ui_preferences),
        }
        with self.config_path.open("w", encoding="utf-8") as fp:
            json.dump(payload, fp, indent=2)

    def _from_raw(self, raw: dict) -> AppConfig:
        defaults = default_config()

        categories_raw = raw.get("categories") or [asdict(item) for item in defaults.categories]
        categories: list[CategoryTemplate] = []
        for index, item in enumerate(categories_raw):
            category_id = str(item.get("id") or f"cat_{index + 1}")
            name = str(item.get("name") or f"Category {index + 1}")
            slot = clamp_color_slot(int(item.get("pt_color_slot") or 1))
            preview_hex = palette_hex_for_slot(slot)
            categories.append(
                CategoryTemplate(
                    id=category_id,
                    name=name,
                    pt_color_slot=slot,
                    preview_hex=preview_hex,
                )
            )

        silence_raw = raw.get("silence_profile") or {}
        defaults_silence = defaults.silence_profile
        silence = SilenceProfile(
            threshold_db=float(silence_raw.get("threshold_db", defaults_silence.threshold_db)),
            min_strip_ms=int(silence_raw.get("min_strip_ms", defaults_silence.min_strip_ms)),
            min_silence_ms=int(silence_raw.get("min_silence_ms", defaults_silence.min_silence_ms)),
            start_pad_ms=int(silence_raw.get("start_pad_ms", defaults_silence.start_pad_ms)),
            end_pad_ms=int(silence_raw.get("end_pad_ms", defaults_silence.end_pad_ms)),
        )

        ai_raw = raw.get("ai_naming") or {}
        defaults_ai = defaults.ai_naming
        ai_naming = AiNamingConfig(
            enabled=bool(ai_raw.get("enabled", defaults_ai.enabled)),
            base_url=str(ai_raw.get("base_url", defaults_ai.base_url)).strip() or defaults_ai.base_url,
            model=str(ai_raw.get("model", defaults_ai.model)).strip() or defaults_ai.model,
            timeout_seconds=max(1, int(ai_raw.get("timeout_seconds", defaults_ai.timeout_seconds))),
            keychain_service=(
                str(ai_raw.get("keychain_service", defaults_ai.keychain_service)).strip()
                or defaults_ai.keychain_service
            ),
            keychain_account=(
                str(ai_raw.get("keychain_account", defaults_ai.keychain_account)).strip()
                or defaults_ai.keychain_account
            ),
        )

        ui_raw = raw.get("ui_preferences") or {}
        defaults_ui = defaults.ui_preferences
        ui_preferences = UiPreferences(
            logs_collapsed_by_default=bool(
                ui_raw.get("logs_collapsed_by_default", defaults_ui.logs_collapsed_by_default)
            ),
            follow_system_theme=bool(ui_raw.get("follow_system_theme", defaults_ui.follow_system_theme)),
        )

        version = int(raw.get("version", CONFIG_VERSION))
        normalized = AppConfig(
            version=max(version, CONFIG_VERSION),
            categories=categories,
            silence_profile=silence,
            ai_naming=ai_naming,
            ui_preferences=ui_preferences,
        )

        if version < CONFIG_VERSION:
            self.save(normalized)

        return normalized
