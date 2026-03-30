from __future__ import annotations

from typing import Any

from .common import ensure_daw_connected
from ..service_container import ServiceContainer
from ...domain.capabilities import DEFAULT_DAW_TARGET
from ...domain.errors import PrestoError


def normalize_version_map(raw_map: Any) -> dict[str, str]:
    if not isinstance(raw_map, dict):
        return {}

    normalized: dict[str, str] = {}
    for raw_key, raw_value in raw_map.items():
        key = str(raw_key).strip()
        value = str(raw_value).strip()
        if not key or not value:
            continue
        normalized[key] = value
    return normalized


def daw_adapter_snapshot_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    daw = ensure_daw_connected(services, "daw.adapter.getSnapshot", payload, raise_on_error=False)
    get_snapshot = getattr(daw, "get_adapter_capability_snapshot", None)
    if not callable(get_snapshot):
        raise PrestoError(
            "DAW_ADAPTER_SNAPSHOT_UNSUPPORTED",
            "Current DAW adapter does not expose capability snapshot data.",
            source="runtime",
            retryable=False,
            capability="daw.adapter.getSnapshot",
            adapter=str(services.target_daw),
        )

    snapshot = get_snapshot()
    adapter_version = str(getattr(snapshot, "adapter_version", "") or "").strip() or "0.0.0"
    host_version = getattr(snapshot, "host_version", None)
    module_versions = normalize_version_map(getattr(snapshot, "module_versions", None))
    capability_versions = normalize_version_map(getattr(snapshot, "capability_versions", None))

    modules_by_id: dict[str, dict[str, str]] = {
        module_id: {"moduleId": module_id, "version": version}
        for module_id, version in module_versions.items()
    }
    capabilities: list[dict[str, str]] = []

    for definition in services.capability_registry.list_public():
        if services.target_daw not in definition.supported_daws:
            continue
        capability_id = str(definition.id)
        module_id = str(definition.domain)
        version = capability_versions.get(capability_id) or module_versions.get(module_id) or adapter_version
        if module_id not in modules_by_id:
            modules_by_id[module_id] = {"moduleId": module_id, "version": version}
        capabilities.append(
            {
                "capabilityId": capability_id,
                "moduleId": module_id,
                "version": version,
            },
        )

    capabilities.sort(key=lambda item: item["capabilityId"])
    modules = [modules_by_id[module_id] for module_id in sorted(modules_by_id.keys())]

    return {
        "targetDaw": services.target_daw or DEFAULT_DAW_TARGET,
        "adapterVersion": adapter_version,
        "hostVersion": str(host_version).strip() if host_version is not None else "",
        "modules": modules,
        "capabilities": capabilities,
    }


def snapshot_payload(payload: dict[str, Any]) -> dict[str, Any]:
    snapshot = payload.get("snapshot")
    if not isinstance(snapshot, dict):
        raise PrestoError(
            "VALIDATION_ERROR",
            "snapshot is required.",
            source="capability",
            retryable=False,
            capability="session.applySnapshot",
            details={
                "rawCode": "VALIDATION_ERROR",
                "rawMessage": "snapshot is required.",
                "field": "snapshot",
            },
            status_code=400,
        )
    return snapshot


def snapshot_statistics(snapshot: dict[str, Any]) -> dict[str, Any]:
    track_states = snapshot.get("trackStates")
    normalized = track_states if isinstance(track_states, list) else []
    muted_tracks = 0
    soloed_tracks = 0
    normal_tracks = 0
    for track_state in normalized:
        is_muted = bool((track_state or {}).get("isMuted"))
        is_soloed = bool((track_state or {}).get("isSoloed"))
        if is_muted:
            muted_tracks += 1
        if is_soloed:
            soloed_tracks += 1
        if not is_muted and not is_soloed:
            normal_tracks += 1
    return {
        "totalTracks": len(normalized),
        "mutedTracks": muted_tracks,
        "soloedTracks": soloed_tracks,
        "normalTracks": normal_tracks,
    }


def get_snapshot_info_payload(payload: dict[str, Any]) -> dict[str, Any]:
    snapshot = snapshot_payload(payload)
    return {
        "snapshot": snapshot,
        "statistics": snapshot_statistics(snapshot),
    }


def apply_snapshot_payload(services: ServiceContainer, payload: dict[str, Any]) -> dict[str, Any]:
    daw = ensure_daw_connected(services, "session.applySnapshot", payload, raise_on_error=True)
    snapshot = snapshot_payload(payload)
    track_states = snapshot.get("trackStates")
    normalized_track_states = track_states if isinstance(track_states, list) else []
    current_tracks = {track.track_name: track for track in daw.list_tracks()}

    success_count = 0
    error_count = 0
    skipped_count = 0

    for track_state in normalized_track_states:
        if not isinstance(track_state, dict):
            error_count += 1
            continue

        track_name = str(track_state.get("trackName", "")).strip()
        if not track_name:
            error_count += 1
            continue

        current_track = current_tracks.get(track_name)
        if current_track is None:
            skipped_count += 1
            continue

        target_muted = bool(track_state.get("isMuted"))
        target_soloed = bool(track_state.get("isSoloed"))
        changed = False
        track_error = False

        if bool(getattr(current_track, "is_muted", False)) != target_muted:
            try:
                daw.set_track_mute_state(track_name, target_muted)
                changed = True
            except Exception:
                error_count += 1
                track_error = True

        if bool(getattr(current_track, "is_soloed", False)) != target_soloed:
            try:
                daw.set_track_solo_state(track_name, target_soloed)
                changed = True
            except Exception:
                error_count += 1
                track_error = True

        if track_error:
            continue
        if changed:
            success_count += 1
        else:
            skipped_count += 1

    return {
        "applied": True,
        "successCount": success_count,
        "errorCount": error_count,
        "skippedCount": skipped_count,
    }
