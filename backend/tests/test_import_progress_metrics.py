from __future__ import annotations

from presto.web_api.progress_metrics import compute_import_overall_progress, compute_import_runtime_progress, estimate_eta_seconds


def test_compute_import_overall_progress_weighted() -> None:
    progress = compute_import_overall_progress("stage_strip_silence", 50.0)
    assert 80.0 <= progress <= 90.0


def test_compute_import_overall_progress_completed_stage() -> None:
    progress = compute_import_overall_progress("stage_completed", 0.0)
    assert progress == 100.0


def test_estimate_eta_seconds_returns_none_on_low_progress() -> None:
    assert estimate_eta_seconds(elapsed_seconds=10.0, progress=2.0) is None


def test_estimate_eta_seconds_returns_value() -> None:
    # elapsed=30s, progress=50% -> remaining ~= 30s
    assert estimate_eta_seconds(elapsed_seconds=30.0, progress=50.0) == 30


def test_compute_import_runtime_progress_prefers_overall_units() -> None:
    progress = compute_import_runtime_progress(
        overall_current=9,
        overall_total=30,
        stage="stage_strip_silence",
        stage_progress=50.0,
    )
    assert progress == 30.0


def test_compute_import_runtime_progress_falls_back_to_stage_weights() -> None:
    progress = compute_import_runtime_progress(
        overall_current=0,
        overall_total=0,
        stage="stage_strip_silence",
        stage_progress=50.0,
    )
    assert 80.0 <= progress <= 90.0
