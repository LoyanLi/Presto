"""Default configuration values."""

from __future__ import annotations

from presto.domain.pt_color_palette import palette_hex_for_slot
from presto.domain.models import (
    AiNamingConfig,
    AppConfig,
    CategoryTemplate,
    SilenceProfile,
    UiPreferences,
)

CONFIG_VERSION = 3


DEFAULT_CATEGORIES = [
    CategoryTemplate("drums", "Drums", 3, palette_hex_for_slot(3)),
    CategoryTemplate("bass", "Bass", 9, palette_hex_for_slot(9)),
    CategoryTemplate("guitar", "Guitar", 13, palette_hex_for_slot(13)),
    CategoryTemplate("keys", "Keys", 18, palette_hex_for_slot(18)),
    CategoryTemplate("lead_vox", "LeadVox", 23, palette_hex_for_slot(23)),
    CategoryTemplate("bgv", "BGV", 28, palette_hex_for_slot(28)),
    CategoryTemplate("fx", "FX", 33, palette_hex_for_slot(33)),
    CategoryTemplate("other", "Other", 38, palette_hex_for_slot(38)),
]

DEFAULT_SILENCE_PROFILE = SilenceProfile(
    threshold_db=-48.0,
    min_strip_ms=120,
    min_silence_ms=120,
    start_pad_ms=5,
    end_pad_ms=20,
)

DEFAULT_AI_NAMING_CONFIG = AiNamingConfig(
    enabled=True,
    base_url="https://api.openai.com/v1",
    model="gpt-4.1-mini",
    timeout_seconds=30,
    keychain_service="Presto.AINaming",
    keychain_account="default",
)

DEFAULT_UI_PREFERENCES = UiPreferences(
    logs_collapsed_by_default=True,
    follow_system_theme=True,
)


def default_config() -> AppConfig:
    """Return default app config."""

    return AppConfig(
        version=CONFIG_VERSION,
        categories=list(DEFAULT_CATEGORIES),
        silence_profile=DEFAULT_SILENCE_PROFILE,
        ai_naming=DEFAULT_AI_NAMING_CONFIG,
        ui_preferences=DEFAULT_UI_PREFERENCES,
    )
