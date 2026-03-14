"""Progress and ETA helpers for import runtime status."""

from __future__ import annotations

from typing import Final


_STAGE_ORDER: Final[tuple[str, ...]] = (
    "stage_import_rename",
    "stage_color_batch",
    "stage_strip_silence",
)

_STAGE_WEIGHTS: Final[dict[str, float]] = {
    "stage_import_rename": 0.55,
    "stage_color_batch": 0.10,
    "stage_strip_silence": 0.35,
}


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def compute_import_overall_progress(stage: str, stage_progress: float) -> float:
    """Compute weighted overall progress from stage and stage progress."""

    if stage == "stage_completed":
        return 100.0

    if stage not in _STAGE_WEIGHTS:
        return _clamp(stage_progress, 0.0, 100.0)

    stage_ratio = _clamp(stage_progress, 0.0, 100.0) / 100.0
    finished_weight = 0.0
    for stage_name in _STAGE_ORDER:
        if stage_name == stage:
            break
        finished_weight += _STAGE_WEIGHTS.get(stage_name, 0.0)

    progress = (finished_weight + (_STAGE_WEIGHTS[stage] * stage_ratio)) * 100.0
    return _clamp(progress, 0.0, 100.0)


def compute_import_runtime_progress(
    *,
    overall_current: int,
    overall_total: int,
    stage: str,
    stage_progress: float,
) -> float:
    """Compute import overall progress using runtime unit counters when available."""

    if overall_total > 0:
        ratio = _clamp(overall_current / max(overall_total, 1), 0.0, 1.0)
        return ratio * 100.0
    return compute_import_overall_progress(stage, stage_progress)


def estimate_eta_seconds(
    *,
    elapsed_seconds: float,
    progress: float,
    min_progress_for_eta: float = 5.0,
    max_eta_seconds: int = 24 * 60 * 60,
) -> int | None:
    """Estimate ETA from elapsed seconds and progress percentage."""

    safe_progress = _clamp(progress, 0.0, 100.0)
    if elapsed_seconds <= 0 or safe_progress < min_progress_for_eta or safe_progress >= 100.0:
        return None

    remaining = elapsed_seconds * (100.0 - safe_progress) / safe_progress
    if remaining <= 0:
        return 0
    return int(round(min(remaining, float(max_eta_seconds))))
