from __future__ import annotations

from typing import Any

from .common import ensure_daw_connected
from ...domain.ports import CapabilityExecutionContext


def clip_select_all_on_track_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    daw = ensure_daw_connected(ctx, "daw.clip.selectAllOnTrack", payload, raise_on_error=True)
    daw.select_all_clips_on_track(str(payload.get("trackName", "")))
    return {"selected": True}
