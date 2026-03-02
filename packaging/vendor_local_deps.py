#!/usr/bin/env python3
"""Vendor runtime dependencies into project-local .vendor directory.

This script copies already-installed Python modules from current environment
into `./.vendor`, so the app can run without relying on global site-packages.
"""

from __future__ import annotations

import importlib.util
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENDOR_DIR = ROOT / ".vendor"

# Modules required by backend runtime.
MODULES = [
    # PTSL stack
    "ptsl",
    "grpc",
    "google",
    # API stack
    "fastapi",
    "uvicorn",
]


def _copy_path(src: Path, dst_base: Path) -> None:
    if src.is_dir():
        dst = dst_base / src.name
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
    else:
        dst = dst_base / src.name
        if dst.exists():
            dst.unlink()
        shutil.copy2(src, dst)


def _resolve_module_paths(module: str) -> list[Path]:
    spec = importlib.util.find_spec(module)
    if spec is None:
        return []

    paths: list[Path] = []
    if spec.submodule_search_locations:
        for location in spec.submodule_search_locations:
            paths.append(Path(location).resolve())
    elif spec.origin:
        paths.append(Path(spec.origin).resolve())
    return paths


def main() -> int:
    VENDOR_DIR.mkdir(parents=True, exist_ok=True)

    missing: list[str] = []
    copied: list[str] = []

    for module in MODULES:
        module_paths = _resolve_module_paths(module)
        if not module_paths:
            missing.append(module)
            continue

        for path in module_paths:
            _copy_path(path, VENDOR_DIR)
            copied.append(str(path))

    print(f"Vendor directory: {VENDOR_DIR}")
    print(f"Copied entries: {len(copied)}")
    for item in copied:
        print(f"  - {item}")

    if missing:
        print("Missing modules (not copied):")
        for module in missing:
            print(f"  - {module}")

    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
