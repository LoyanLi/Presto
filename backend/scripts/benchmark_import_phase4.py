#!/usr/bin/env python3
"""Synthetic benchmark harness for Phase 4 import pipeline."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
import sys
import time
from typing import Any


IMPORT_BACKEND_ROOT = Path(__file__).resolve().parents[1] / "import"
if str(IMPORT_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(IMPORT_BACKEND_ROOT))

from presto.app.orchestrator import ImportOrchestrator  # noqa: E402
from presto.domain.models import ResolvedImportItem, SilenceProfile  # noqa: E402


class _BenchmarkGateway:
    def __init__(self) -> None:
        self._tracks = ["Existing"]
        self._import_seq = 0

    def list_track_names(self) -> list[str]:
        return list(self._tracks)

    def import_audio_file(self, path: str) -> str:
        self._import_seq += 1
        name = f"Imported::{self._import_seq}::{Path(path).stem}"
        self._tracks.append(name)
        return name

    def rename_track(self, current_name: str, new_name: str) -> None:
        idx = self._tracks.index(current_name)
        self._tracks[idx] = new_name

    def select_track(self, name: str) -> None:
        _ = name

    def apply_track_color(self, slot: int, track_name: str) -> None:
        _ = (slot, track_name)

    def apply_track_color_batch(self, slot: int, track_names: list[str]) -> None:
        _ = (slot, track_names)

    def select_all_clips_on_track(self, name: str) -> None:
        _ = name


class _BenchmarkUiAutomation:
    def strip_silence(self, track_name: str, profile: SilenceProfile) -> None:
        _ = (track_name, profile)


def _build_items(track_count: int) -> list[ResolvedImportItem]:
    items: list[ResolvedImportItem] = []
    for idx in range(track_count):
        category_id = "drums" if idx % 2 == 0 else "bass"
        items.append(
            ResolvedImportItem(
                file_path=f"/benchmark/audio_{idx:04d}.wav",
                category_id=category_id,
                target_track_name=f"Track_{idx:04d}",
            )
        )
    return items


def run_scenario(track_count: int) -> dict[str, Any]:
    gateway = _BenchmarkGateway()
    ui = _BenchmarkUiAutomation()
    orchestrator = ImportOrchestrator(gateway=gateway, ui_automation=ui)

    stage_first_seen: dict[str, float] = {}
    stage_last_seen: dict[str, float] = {}
    stage_events: dict[str, int] = {}

    def _on_stage(
        stage_name: str,
        stage_current: int,
        stage_total: int,
        overall_current: int,
        overall_total: int,
        current_name: str,
    ) -> None:
        _ = (stage_current, stage_total, overall_current, overall_total, current_name)
        now = time.perf_counter()
        if stage_name not in stage_first_seen:
            stage_first_seen[stage_name] = now
        stage_last_seen[stage_name] = now
        stage_events[stage_name] = stage_events.get(stage_name, 0) + 1

    started = time.perf_counter()
    report = orchestrator.run_resolved(
        items=_build_items(track_count),
        category_map={
            "drums": ("Drums", 3),
            "bass": ("Bass", 9),
        },
        silence_profile=SilenceProfile(-48.0, 120, 120, 5, 20),
        stage_progress_callback=_on_stage,
    )
    elapsed = time.perf_counter() - started

    stage_breakdown: dict[str, dict[str, Any]] = {}
    for stage_name, first in stage_first_seen.items():
        last = stage_last_seen.get(stage_name, first)
        stage_breakdown[stage_name] = {
            "seconds": max(0.0, last - first),
            "events": stage_events.get(stage_name, 0),
        }

    return {
        "scenario": f"{track_count}_tracks",
        "track_count": track_count,
        "total_seconds": elapsed,
        "stage_breakdown": stage_breakdown,
        "success_count": report.success_count,
        "failed_count": report.failed_count,
    }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Benchmark Presto Phase 4 import pipeline.")
    parser.add_argument("--tracks", type=int, action="append", help="Track count per scenario.", default=[])
    parser.add_argument("--json", action="store_true", help="Emit JSON payload only.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    scenarios = args.tracks if args.tracks else [100, 150, 200]
    results = [run_scenario(track_count=value) for value in scenarios]
    payload = {"generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "scenarios": results}

    if args.json:
        print(json.dumps(payload, ensure_ascii=False))
        return

    print("Phase 4 Import Benchmark")
    for row in results:
        print(
            f"- {row['scenario']}: total={row['total_seconds']:.4f}s "
            f"success={row['success_count']} failed={row['failed_count']}"
        )


if __name__ == "__main__":
    main()
