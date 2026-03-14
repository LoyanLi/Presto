from __future__ import annotations

import sys
from pathlib import Path


EXPORT_BACKEND_ROOT = Path(__file__).resolve().parents[1] / "export"
if str(EXPORT_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(EXPORT_BACKEND_ROOT))

from api.progress_metrics import compute_export_snapshot_progress, estimate_eta_seconds  # type: ignore[import-not-found]


def test_compute_export_snapshot_progress_mid_step() -> None:
    value = compute_export_snapshot_progress(snapshot_index=1, total_snapshots=4, step_progress=50.0)
    assert 35.0 <= value <= 40.0


def test_estimate_eta_seconds_returns_none_on_low_progress() -> None:
    assert estimate_eta_seconds(elapsed_seconds=10.0, progress=2.0) is None


def test_estimate_eta_seconds_returns_value() -> None:
    assert estimate_eta_seconds(elapsed_seconds=30.0, progress=50.0) == 30
