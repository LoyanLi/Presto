from __future__ import annotations

import unittest

from presto.domain.models import (
    RunReport,
    TrackProcessResult,
    allocate_unique_track_name,
    is_supported_audio_file,
)


class ModelsTests(unittest.TestCase):
    def test_audio_file_filter(self) -> None:
        self.assertTrue(is_supported_audio_file("/tmp/kick.wav"))
        self.assertTrue(is_supported_audio_file("/tmp/snare.AIFF"))
        self.assertFalse(is_supported_audio_file("/tmp/vox.mp3"))

    def test_allocate_unique_track_name(self) -> None:
        existing = {"Drums__Kick", "Drums__Kick_2"}
        actual = allocate_unique_track_name("Drums__Kick", existing)
        self.assertEqual(actual, "Drums__Kick_3")

    def test_run_report_counts(self) -> None:
        report = RunReport.from_results(
            started_at=__import__("datetime").datetime.now(),
            finished_at=__import__("datetime").datetime.now(),
            results=[
                TrackProcessResult("a.wav", "A", "success", None, None),
                TrackProcessResult("b.wav", None, "failed", "E", "err"),
                TrackProcessResult("c.mp3", None, "skipped", "S", "skip"),
            ],
        )
        self.assertEqual(report.total, 3)
        self.assertEqual(report.success_count, 1)
        self.assertEqual(report.failed_count, 1)


if __name__ == "__main__":
    unittest.main()
