from __future__ import annotations

from presto.web_api.server import _error_payload


def test_error_payload_contains_friendly_block() -> None:
    payload = _error_payload("NO_TRACK_SELECTED", "No track selected")
    assert payload["success"] is False
    assert payload["error_code"] == "NO_TRACK_SELECTED"
    assert payload["message"] == "No track selected"
    assert payload["friendly"]["title"]
    assert isinstance(payload["friendly"]["actions"], list)


def test_error_payload_wraps_non_dict_details() -> None:
    payload = _error_payload("UNEXPECTED_ERROR", "boom", details="traceback")
    assert payload["details"]["raw"] == "traceback"
