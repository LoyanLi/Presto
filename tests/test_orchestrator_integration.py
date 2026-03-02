from __future__ import annotations

import unittest

from presto.app.orchestrator import ImportOrchestrator
from presto.domain.errors import UiAutomationError
from presto.domain.models import ImportItem, ResolvedImportItem, SilenceProfile


class FakeGateway:
    def __init__(self) -> None:
        self.connected = False
        self.saved = False
        self._tracks = ["Existing"]
        self.color_calls: list[tuple[int, str]] = []
        self.color_support_checked = False

    def connect(self) -> None:
        self.connected = True

    def ensure_session_open(self) -> str:
        return "/tmp/test.ptx"

    def ensure_track_color_supported(self) -> None:
        self.color_support_checked = True
        return None

    def list_track_names(self) -> list[str]:
        return list(self._tracks)

    def import_audio_file(self, path: str) -> str:
        new_name = f"Imported::{path.split('/')[-1]}"
        self._tracks.append(new_name)
        return new_name

    def rename_track(self, current_name: str, new_name: str) -> None:
        idx = self._tracks.index(current_name)
        self._tracks[idx] = new_name

    def select_track(self, name: str) -> None:
        return None

    def apply_track_color(self, slot: int, track_name: str) -> None:
        self.color_calls.append((slot, track_name))

    def select_all_clips_on_track(self, name: str) -> None:
        return None

    def save_session(self) -> None:
        self.saved = True


class FakeUiAutomation:
    def __init__(self) -> None:
        self.fail_on_track = "Bass__bass"

    def preflight_accessibility(self) -> None:
        return None

    def open_strip_silence_window(self) -> None:
        return None

    def strip_silence(self, track_name: str, profile: SilenceProfile) -> None:
        if track_name == self.fail_on_track:
            raise UiAutomationError("UI_ACTION_FAILED", "Injected strip failure")


class OrchestratorIntegrationTests(unittest.TestCase):
    def test_preflight_checks_track_color_support(self) -> None:
        gateway = FakeGateway()
        ui = FakeUiAutomation()
        orchestrator = ImportOrchestrator(gateway=gateway, ui_automation=ui)
        session_path = orchestrator.preflight()
        self.assertEqual(session_path, "/tmp/test.ptx")
        self.assertTrue(gateway.connected)
        self.assertTrue(gateway.color_support_checked)

    def test_continue_on_failure_and_skip_unsupported(self) -> None:
        gateway = FakeGateway()
        ui = FakeUiAutomation()
        orchestrator = ImportOrchestrator(gateway=gateway, ui_automation=ui)

        report = orchestrator.run(
            items=[
                ImportItem("/tmp/kick.wav", "drums"),
                ImportItem("/tmp/vox.mp3", "drums"),
                ImportItem("/tmp/bass.wav", "bass"),
            ],
            category_map={
                "drums": ("Drums", 3),
                "bass": ("Bass", 9),
            },
            silence_profile=SilenceProfile(-48.0, 120, 120, 5, 20),
        )

        self.assertEqual(report.total, 3)
        self.assertEqual(report.success_count, 1)
        self.assertEqual(report.failed_count, 1)
        self.assertEqual(gateway.color_calls, [(3, "Drums__kick"), (9, "Bass__bass")])

        statuses = [result.status for result in report.results]
        self.assertEqual(statuses, ["success", "skipped", "failed"])

    def test_run_resolved_uses_target_track_name(self) -> None:
        gateway = FakeGateway()
        ui = FakeUiAutomation()
        ui.fail_on_track = "__never__"
        orchestrator = ImportOrchestrator(gateway=gateway, ui_automation=ui)

        report = orchestrator.run_resolved(
            items=[ResolvedImportItem("/tmp/kick.wav", "drums", "Kick_AI_Name")],
            category_map={"drums": ("Drums", 3)},
            silence_profile=SilenceProfile(-48.0, 120, 120, 5, 20),
        )

        self.assertEqual(report.total, 1)
        self.assertEqual(report.success_count, 1)
        self.assertEqual(report.results[0].track_name, "Kick_AI_Name")
        self.assertEqual(gateway.color_calls, [(3, "Kick_AI_Name")])


if __name__ == "__main__":
    unittest.main()
