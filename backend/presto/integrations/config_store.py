from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass, field
import json
import os
from pathlib import Path
from typing import Any

from ..domain.capabilities import DEFAULT_DAW_TARGET
from ..domain.ports import ConfigStorePort


def create_default_app_config() -> dict[str, Any]:
    return {
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
        "hostPreferences": {
            "language": "system",
            "dawTarget": DEFAULT_DAW_TARGET,
            "includePrereleaseUpdates": False,
        },
    }


@dataclass
class InMemoryConfigStore:
    config: dict[str, Any] = field(default_factory=create_default_app_config)

    def load(self) -> dict[str, Any]:
        return deepcopy(self.config)

    def save(self, config: Any) -> None:
        self.config = deepcopy(config)


@dataclass
class FileConfigStore:
    file_path: Path

    def load(self) -> dict[str, Any]:
        if not self.file_path.exists():
            config = create_default_app_config()
            self.save(config)
            return deepcopy(config)

        raw = self.file_path.read_text(encoding="utf8")
        loaded = json.loads(raw)
        if not isinstance(loaded, dict):
            raise ValueError("config_file_must_contain_json_object")
        return deepcopy(loaded)

    def save(self, config: Any) -> None:
        self.file_path.parent.mkdir(parents=True, exist_ok=True)
        self.file_path.write_text(f"{json.dumps(config, indent=2, ensure_ascii=True)}\n", encoding="utf8")


def create_default_config_store() -> ConfigStorePort:
    app_data_dir = os.environ.get("PRESTO_APP_DATA_DIR", "").strip()
    if not app_data_dir:
        return InMemoryConfigStore()
    return FileConfigStore(Path(app_data_dir).expanduser().resolve() / "config.json")
