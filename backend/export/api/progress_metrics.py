#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""导出任务进度与 ETA 计算工具。"""

from __future__ import annotations


def _clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def compute_export_snapshot_progress(snapshot_index: int, total_snapshots: int, step_progress: float) -> float:
    """按快照内阶段进度计算整体百分比。"""

    safe_total = max(total_snapshots, 1)
    safe_step = _clamp(step_progress, 0.0, 100.0) / 100.0
    overall = ((max(snapshot_index, 0) + safe_step) / safe_total) * 100.0
    return _clamp(overall, 0.0, 100.0)


def estimate_eta_seconds(
    *,
    elapsed_seconds: float,
    progress: float,
    min_progress_for_eta: float = 5.0,
    max_eta_seconds: int = 24 * 60 * 60,
) -> int | None:
    safe_progress = _clamp(progress, 0.0, 100.0)
    if elapsed_seconds <= 0 or safe_progress < min_progress_for_eta or safe_progress >= 100.0:
        return None

    remaining = elapsed_seconds * (100.0 - safe_progress) / safe_progress
    if remaining <= 0:
        return 0
    return int(round(min(remaining, float(max_eta_seconds))))
