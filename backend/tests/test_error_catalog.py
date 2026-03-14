from __future__ import annotations

from presto.web_api.error_catalog import build_friendly_error


def test_build_friendly_error_known_code() -> None:
    payload = build_friendly_error("NO_TRACK_SELECTED", "No track selected")
    assert payload["success"] is False
    assert payload["error_code"] == "NO_TRACK_SELECTED"
    assert payload["message"] == "No track selected"
    assert payload["friendly"]["title"]
    assert len(payload["friendly"]["actions"]) >= 1


def test_build_friendly_error_fallback_unknown_code() -> None:
    payload = build_friendly_error("SOME_NEW_ERROR", "raw message")
    assert payload["success"] is False
    assert payload["error_code"] == "SOME_NEW_ERROR"
    assert payload["message"] == "raw message"
    assert payload["friendly"]["title"]
    assert payload["friendly"]["retryable"] in (True, False)
