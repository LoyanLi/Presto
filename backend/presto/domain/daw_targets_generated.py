"""Auto-generated from contracts-manifest/daw-targets.json; do not edit by hand."""
from __future__ import annotations

from typing import Literal, TypeAlias


DawTarget: TypeAlias = Literal["pro_tools", "logic", "cubase", "nuendo"]

DEFAULT_DAW_TARGET: DawTarget = "pro_tools"
RESERVED_DAW_TARGETS: tuple[DawTarget, ...] = ("pro_tools", "logic", "cubase", "nuendo")
SUPPORTED_DAW_TARGETS: tuple[DawTarget, ...] = ("pro_tools",)
