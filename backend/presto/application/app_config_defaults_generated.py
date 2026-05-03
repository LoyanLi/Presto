"""Auto-generated from contracts-manifest/app-config-defaults.json; do not edit by hand."""
from __future__ import annotations

from copy import deepcopy
import json
from typing import Any


_DEFAULT_APP_CONFIG_JSON = "{\n  \"categories\": [],\n  \"silenceProfile\": {\n    \"thresholdDb\": -40,\n    \"minStripMs\": 50,\n    \"minSilenceMs\": 250,\n    \"startPadMs\": 0,\n    \"endPadMs\": 0\n  },\n  \"aiNaming\": {\n    \"enabled\": false,\n    \"baseUrl\": \"\",\n    \"model\": \"\",\n    \"timeoutSeconds\": 30,\n    \"keychainService\": \"openai\",\n    \"keychainAccount\": \"api_key\"\n  },\n  \"uiPreferences\": {\n    \"logsCollapsedByDefault\": true,\n    \"followSystemTheme\": true,\n    \"developerModeEnabled\": true\n  },\n  \"hostPreferences\": {\n    \"language\": \"system\",\n    \"dawTarget\": \"pro_tools\",\n    \"includePrereleaseUpdates\": false\n  }\n}"
DEFAULT_APP_CONFIG: dict[str, Any] = json.loads(_DEFAULT_APP_CONFIG_JSON)


def create_default_app_config() -> dict[str, Any]:
    return deepcopy(DEFAULT_APP_CONFIG)
