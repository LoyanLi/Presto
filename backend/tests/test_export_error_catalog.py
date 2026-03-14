from __future__ import annotations

import sys
from pathlib import Path


EXPORT_BACKEND_ROOT = Path(__file__).resolve().parents[1] / "export"
if str(EXPORT_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(EXPORT_BACKEND_ROOT))

from api.error_catalog import build_friendly_error  # type: ignore[import-not-found]


def test_export_friendly_error_known_code() -> None:
    payload = build_friendly_error("EXPORT_NO_CONNECTION", "not connected")
    assert payload["success"] is False
    assert payload["error_code"] == "EXPORT_NO_CONNECTION"
    assert payload["friendly"]["title"]
    assert payload["friendly"]["actions"]


def test_export_friendly_error_unknown_code_fallback() -> None:
    payload = build_friendly_error("SOMETHING_ELSE", "raw")
    assert payload["success"] is False
    assert payload["error_code"] == "SOMETHING_ELSE"
    assert payload["friendly"]["title"]
