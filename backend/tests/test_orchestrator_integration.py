from __future__ import annotations

import unittest

from presto.app.orchestrator import ImportOrchestrator
from presto.domain.export_models import ExportCancelToken
from presto.domain.errors import GatewayError, UiAutomationError, ValidationError
from presto.domain.models import ImportItem, ResolvedImportItem, SilenceProfile


class FakeGateway:
    def __init__(self) -> None:
        self.connected = False
        self.saved = False
        self._tracks = ["Existing"]
        self.import_batch_calls: list[tuple[str, ...]] = []
        self.color_calls: list[tuple[int, str]] = []
        self.color_batch_calls: list[tuple[int, tuple[str, ...]]] = []
        self.color_support_checked = False
        self.version_checked = False
        self.selection_checked = False
        self.version_error_code: str | None = None
        self.drop_last_from_batch_result = False
        self.single_import_failures: dict[str, tuple[str, str]] = {}
        self.select_track_calls: list[str] = []
        self.select_all_calls: list[str] = []

    def connect(self) -> None:
        self.connected = True

    def ensure_session_open(self) -> str:
        return "/tmp/test.ptx"

    def ensure_track_color_supported(self) -> None:
        self.color_support_checked = True
        return None

    def ensure_minimum_version(self, min_supported: str = "2025.10") -> str:
        _ = min_supported
        if self.version_error_code is not None:
            raise GatewayError(self.version_error_code, f"Injected version error: {self.version_error_code}")
        self.version_checked = True
        return "2025.10"

    def ensure_any_track_selected(self) -> list[str]:
        self.selection_checked = True
        return ["Existing"]

    def list_track_names(self) -> list[str]:
        return list(self._tracks)

    def import_audio_file(self, path: str) -> str:
        if path in self.single_import_failures:
            code, message = self.single_import_failures[path]
            raise GatewayError(code, message)
        new_name = f"Imported::{path.split('/')[-1]}"
        self._tracks.append(new_name)
        return new_name

    def import_audio_files(self, paths: list[str]) -> list[str]:
        self.import_batch_calls.append(tuple(paths))
        imported: list[str] = []
        for path in paths:
            imported.append(self.import_audio_file(path))
        if self.drop_last_from_batch_result and len(imported) > 1:
            return imported[:-1]
        return imported

    def rename_track(self, current_name: str, new_name: str) -> None:
        idx = self._tracks.index(current_name)
        self._tracks[idx] = new_name

    def select_track(self, name: str) -> None:
        self.select_track_calls.append(name)
        return None

    def apply_track_color(self, slot: int, track_name: str) -> None:
        self.color_calls.append((slot, track_name))

    def apply_track_color_batch(self, slot: int, track_names: list[str]) -> None:
        self.color_batch_calls.append((slot, tuple(track_names)))
        for track_name in track_names:
            self.apply_track_color(slot, track_name)

    def select_all_clips_on_track(self, name: str) -> None:
        self.select_all_calls.append(name)
        return None

    def save_session(self) -> None:
        self.saved = True


class FakeUiAutomation:
    def __init__(self) -> None:
        self.fail_on_track = "Bass__bass"
        self.open_strip_called = False

    def preflight_accessibility(self) -> None:
        return None

    def open_strip_silence_window(self) -> None:
        self.open_strip_called = True
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
        self.assertTrue(gateway.version_checked)

    def test_prepare_strip_silence_opens_window_without_track_selection(self) -> None:
        gateway = FakeGateway()
        ui = FakeUiAutomation()
        orchestrator = ImportOrchestrator(gateway=gateway, ui_automation=ui)

        orchestrator.prepare_strip_silence()

        self.assertFalse(gateway.selection_checked)
        self.assertTrue(ui.open_strip_called)

    def test_preflight_allows_unknown_version_when_color_support_available(self) -> None:
        gateway = FakeGateway()
        gateway.version_error_code = "PT_VERSION_UNKNOWN"
        ui = FakeUiAutomation()
        orchestrator = ImportOrchestrator(gateway=gateway, ui_automation=ui)

        session_path = orchestrator.preflight()

        self.assertEqual(session_path, "/tmp/test.ptx")
        self.assertTrue(gateway.connected)
        self.assertTrue(gateway.color_support_checked)

    def test_preflight_blocks_when_version_explicitly_unsupported(self) -> None:
        gateway = FakeGateway()
        gateway.version_error_code = "PT_VERSION_UNSUPPORTED"
        ui = FakeUiAutomation()
        orchestrator = ImportOrchestrator(gateway=gateway, ui_automation=ui)

        with self.assertRaises(GatewayError) as ctx:
            orchestrator.preflight()

        self.assertEqual(ctx.exception.code, "PT_VERSION_UNSUPPORTED")

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
        self.assertEqual(gateway.color_batch_calls, [])

    def test_run_resolved_emits_staged_progress_in_order(self) -> None:
        gateway = FakeGateway()
        ui = FakeUiAutomation()
        ui.fail_on_track = "__never__"
        orchestrator = ImportOrchestrator(gateway=gateway, ui_automation=ui)

        stage_events: list[tuple[str, int, int, int, int, str]] = []
        report = orchestrator.run_resolved(
            items=[
                ResolvedImportItem("/tmp/kick.wav", "drums", "Kick_AI_Name"),
                ResolvedImportItem("/tmp/snare.wav", "drums", "Snare_AI_Name"),
            ],
            category_map={"drums": ("Drums", 3)},
            silence_profile=SilenceProfile(-48.0, 120, 120, 5, 20),
            stage_progress_callback=lambda stage, sc, st, oc, ot, name: stage_events.append(
                (stage, sc, st, oc, ot, name)
            ),
        )

        self.assertEqual(report.success_count, 2)
        self.assertEqual(len(stage_events), 6)
        stage_order_map = {
            "stage_import_rename": 1,
            "stage_color_batch": 2,
            "stage_strip_silence": 3,
        }
        stage_ordinals = [stage_order_map[event[0]] for event in stage_events]
        self.assertEqual(stage_ordinals, [1, 2, 3, 1, 2, 3])
        overall_values = [event[3] for event in stage_events]
        self.assertEqual(overall_values, sorted(overall_values))

    def test_run_resolved_reselects_track_before_strip_stage(self) -> None:
        gateway = FakeGateway()
        ui = FakeUiAutomation()
        ui.fail_on_track = "__never__"
        orchestrator = ImportOrchestrator(gateway=gateway, ui_automation=ui)

        report = orchestrator.run_resolved(
            items=[
                ResolvedImportItem("/tmp/kick.wav", "drums", "Kick_AI_Name"),
                ResolvedImportItem("/tmp/snare.wav", "drums", "Snare_AI_Name"),
            ],
            category_map={"drums": ("Drums", 3)},
            silence_profile=SilenceProfile(-48.0, 120, 120, 5, 20),
        )

        self.assertEqual(report.success_count, 2)
        self.assertEqual(gateway.select_all_calls, ["Kick_AI_Name", "Snare_AI_Name"])
        self.assertEqual(gateway.select_track_calls, ["Kick_AI_Name", "Snare_AI_Name"])

    def test_run_resolved_strips_each_track_before_next_rename(self) -> None:
        events: list[str] = []

        class SpyGateway(FakeGateway):
            def rename_track(self, current_name: str, new_name: str) -> None:
                events.append(f"rename:{new_name}")
                super().rename_track(current_name, new_name)

            def select_all_clips_on_track(self, name: str) -> None:
                events.append(f"select_all:{name}")
                super().select_all_clips_on_track(name)

        class SpyUi(FakeUiAutomation):
            def strip_silence(self, track_name: str, profile: SilenceProfile) -> None:
                _ = profile
                events.append(f"strip:{track_name}")
                return None

        gateway = SpyGateway()
        ui = SpyUi()
        ui.fail_on_track = "__never__"
        orchestrator = ImportOrchestrator(gateway=gateway, ui_automation=ui, category_batch_size=2)

        report = orchestrator.run_resolved(
            items=[
                ResolvedImportItem("/tmp/kick.wav", "drums", "Kick_AI_Name"),
                ResolvedImportItem("/tmp/snare.wav", "drums", "Snare_AI_Name"),
            ],
            category_map={"drums": ("Drums", 3)},
            silence_profile=SilenceProfile(-48.0, 120, 120, 5, 20),
        )

        self.assertEqual(report.success_count, 2)
        self.assertIn("rename:Kick_AI_Name", events)
        self.assertIn("rename:Snare_AI_Name", events)
        self.assertIn("strip:Kick_AI_Name", events)
        self.assertIn("strip:Snare_AI_Name", events)
        self.assertLess(events.index("rename:Kick_AI_Name"), events.index("strip:Kick_AI_Name"))
        self.assertLess(events.index("strip:Kick_AI_Name"), events.index("rename:Snare_AI_Name"))

    def test_run_resolved_imports_in_category_batches(self) -> None:
        gateway = FakeGateway()
        ui = FakeUiAutomation()
        ui.fail_on_track = "__never__"
        orchestrator = ImportOrchestrator(gateway=gateway, ui_automation=ui, category_batch_size=2)

        report = orchestrator.run_resolved(
            items=[
                ResolvedImportItem("/tmp/kick.wav", "drums", "Kick_AI_Name"),
                ResolvedImportItem("/tmp/snare.wav", "drums", "Snare_AI_Name"),
                ResolvedImportItem("/tmp/bass.wav", "bass", "Bass_AI_Name"),
            ],
            category_map={
                "drums": ("Drums", 3),
                "bass": ("Bass", 9),
            },
            silence_profile=SilenceProfile(-48.0, 120, 120, 5, 20),
        )

        self.assertEqual(report.success_count, 3)
        self.assertEqual(
            gateway.import_batch_calls,
            [
                ("/tmp/kick.wav", "/tmp/snare.wav"),
                ("/tmp/bass.wav",),
            ],
        )

    def test_run_resolved_retries_missing_tracks_per_file(self) -> None:
        gateway = FakeGateway()
        gateway.drop_last_from_batch_result = True
        ui = FakeUiAutomation()
        ui.fail_on_track = "__never__"
        orchestrator = ImportOrchestrator(gateway=gateway, ui_automation=ui, category_batch_size=12)

        report = orchestrator.run_resolved(
            items=[
                ResolvedImportItem("/tmp/kick.wav", "drums", "Kick_AI_Name"),
                ResolvedImportItem("/tmp/snare.wav", "drums", "Snare_AI_Name"),
                ResolvedImportItem("/tmp/bass.wav", "drums", "Bass_AI_Name"),
            ],
            category_map={"drums": ("Drums", 3)},
            silence_profile=SilenceProfile(-48.0, 120, 120, 5, 20),
        )

        self.assertEqual(report.total, 3)
        self.assertEqual(report.success_count, 3)
        self.assertEqual(report.failed_count, 0)

    def test_run_resolved_marks_specific_file_when_single_retry_fails(self) -> None:
        gateway = FakeGateway()
        gateway.drop_last_from_batch_result = True
        gateway.single_import_failures["/tmp/bass.wav"] = ("IMPORT_FAILED", "Sample rate mismatch on bass.wav")
        ui = FakeUiAutomation()
        ui.fail_on_track = "__never__"
        orchestrator = ImportOrchestrator(gateway=gateway, ui_automation=ui, category_batch_size=12)

        report = orchestrator.run_resolved(
            items=[
                ResolvedImportItem("/tmp/kick.wav", "drums", "Kick_AI_Name"),
                ResolvedImportItem("/tmp/snare.wav", "drums", "Snare_AI_Name"),
                ResolvedImportItem("/tmp/bass.wav", "drums", "Bass_AI_Name"),
            ],
            category_map={"drums": ("Drums", 3)},
            silence_profile=SilenceProfile(-48.0, 120, 120, 5, 20),
        )

        self.assertEqual(report.total, 3)
        self.assertEqual(report.success_count, 2)
        self.assertEqual(report.failed_count, 1)
        failed = report.results[2]
        self.assertEqual(failed.error_code, "TRACK_DETECTION_FAILED")
        self.assertIn("track detection count mismatch", (failed.error_message or "").lower())
        self.assertIn("bass.wav", failed.error_message or "")
        self.assertIn("Sample rate mismatch on bass.wav", failed.error_message or "")

    def test_run_resolved_raises_cancelled_when_token_is_cancelled(self) -> None:
        gateway = FakeGateway()
        ui = FakeUiAutomation()
        ui.fail_on_track = "__never__"
        orchestrator = ImportOrchestrator(gateway=gateway, ui_automation=ui, category_batch_size=12)
        token = ExportCancelToken(cancelled=True)

        with self.assertRaises(ValidationError) as ctx:
            orchestrator.run_resolved(
                items=[ResolvedImportItem("/tmp/kick.wav", "drums", "Kick_AI_Name")],
                category_map={"drums": ("Drums", 3)},
                silence_profile=SilenceProfile(-48.0, 120, 120, 5, 20),
                cancel_token=token,
            )
        self.assertEqual(ctx.exception.code, "IMPORT_CANCELLED")


if __name__ == "__main__":
    unittest.main()
