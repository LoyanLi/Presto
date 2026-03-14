from __future__ import annotations

import unittest
from pathlib import Path

from presto.domain.errors import UiAutomationError
from presto.infra.protools_ui_automation import ProToolsUiAutomation


def _selector_path() -> Path:
    return (
        Path(__file__)
        .resolve()
        .parents[1]
        / "import"
        / "presto"
        / "infra"
        / "selector_map_en_us.json"
    )


class UiAutomationRetryTests(unittest.TestCase):
    def _make_automation(self, retry_count: int = 3) -> ProToolsUiAutomation:
        return ProToolsUiAutomation(selector_map_path=_selector_path(), retry_count=retry_count)

    def test_with_retry_retries_retryable_errors_until_success(self) -> None:
        automation = self._make_automation(retry_count=3)
        ensure_calls: list[str] = []
        automation._ensure_action_context = lambda step: ensure_calls.append(step)  # type: ignore[attr-defined]

        attempts = {"count": 0}

        def flaky_action() -> None:
            attempts["count"] += 1
            if attempts["count"] < 3:
                raise UiAutomationError("UI_NOT_FRONTMOST", "Pro Tools lost focus.")

        automation._with_retry(
            action=flaky_action,
            fallback_code="UI_ACTION_FAILED",
            fallback_message="Failed action.",
            step_label="apply_track_color",
        )

        self.assertEqual(attempts["count"], 3)
        self.assertEqual(ensure_calls, ["apply_track_color", "apply_track_color", "apply_track_color"])

    def test_with_retry_stops_immediately_on_non_retryable_error(self) -> None:
        automation = self._make_automation(retry_count=4)
        ensure_calls: list[str] = []
        automation._ensure_action_context = lambda step: ensure_calls.append(step)  # type: ignore[attr-defined]

        attempts = {"count": 0}

        def non_retryable_action() -> None:
            attempts["count"] += 1
            raise UiAutomationError("UI_PERMISSION_DENIED", "Accessibility permission missing.")

        with self.assertRaises(UiAutomationError) as ctx:
            automation._with_retry(
                action=non_retryable_action,
                fallback_code="UI_ACTION_FAILED",
                fallback_message="Failed action.",
                step_label="open_strip_silence_window",
            )

        self.assertEqual(attempts["count"], 1)
        self.assertEqual(ensure_calls, ["open_strip_silence_window"])
        self.assertEqual(ctx.exception.code, "UI_PERMISSION_DENIED")
        self.assertIn("step=open_strip_silence_window", ctx.exception.message)
        self.assertIn("retryable=false", ctx.exception.message.lower())

    def test_public_actions_forward_step_labels(self) -> None:
        automation = self._make_automation(retry_count=2)
        seen_labels: list[str] = []
        legacy_calls = {"count": 0}
        opened = {"count": 0}

        def fake_with_retry(action, fallback_code: str, fallback_message: str, step_label: str) -> None:
            _ = action
            _ = fallback_code
            _ = fallback_message
            seen_labels.append(step_label)

        def fake_with_retry_legacy(action, fallback_code: str, fallback_message: str) -> None:
            _ = action
            _ = fallback_code
            _ = fallback_message
            legacy_calls["count"] += 1

        automation._with_retry = fake_with_retry  # type: ignore[method-assign]
        automation._with_retry_legacy = fake_with_retry_legacy  # type: ignore[method-assign]
        automation._open_strip_silence_window_once = lambda: opened.__setitem__("count", opened["count"] + 1)  # type: ignore[method-assign]

        automation.apply_track_color(slot=1, track_name="Kick")
        automation.strip_silence(track_name="Kick", profile=None)  # type: ignore[arg-type]
        automation.open_strip_silence_window()

        self.assertEqual(seen_labels, ["apply_track_color"])
        self.assertEqual(legacy_calls["count"], 1)
        self.assertEqual(opened["count"], 1)

    def test_strip_silence_keeps_legacy_retry_without_context_precheck(self) -> None:
        automation = self._make_automation(retry_count=1)
        strip_calls = {"count": 0}

        def fail_if_context_called(step: str) -> None:
            raise UiAutomationError("UI_ACTION_FAILED", f"context should not run for strip_silence: {step}")

        automation._ensure_action_context = fail_if_context_called  # type: ignore[attr-defined]
        automation._strip_silence_once = lambda track_name: strip_calls.__setitem__(  # type: ignore[method-assign]
            "count", strip_calls["count"] + 1
        )

        automation.strip_silence(track_name="Kick", profile=None)  # type: ignore[arg-type]
        self.assertEqual(strip_calls["count"], 1)


if __name__ == "__main__":
    unittest.main()
