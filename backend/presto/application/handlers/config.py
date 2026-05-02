from __future__ import annotations

from typing import Any

from .common import validation_error
from ...domain.errors import PrestoError
from ...domain.ports import CapabilityExecutionContext


def config_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    del payload
    config_store = ctx.config_store
    if config_store is None:
        raise PrestoError(
            "CONFIG_STORE_UNAVAILABLE",
            "Config store is not configured.",
            source="runtime",
            retryable=False,
            capability="config.get",
        )
    return {"config": config_store.load()}


def update_config_payload(ctx: CapabilityExecutionContext, payload: dict[str, Any]) -> dict[str, Any]:
    config_store = ctx.config_store
    keychain_store = ctx.keychain_store
    if config_store is None or keychain_store is None:
        raise PrestoError(
            "CONFIG_STORE_UNAVAILABLE",
            "Config store is not configured.",
            source="runtime",
            retryable=False,
            capability="config.update",
        )

    config = payload.get("config")
    if not isinstance(config, dict):
        raise validation_error("config is required.", field="config", capability="config.update")

    api_key = payload.get("apiKey")
    if api_key is not None:
        if not isinstance(api_key, str) or not api_key.strip():
            raise validation_error("apiKey must be a non-empty string.", field="apiKey", capability="config.update")
        ai_naming = config.get("aiNaming") if isinstance(config.get("aiNaming"), dict) else {}
        service = str(ai_naming.get("keychainService", "openai")).strip() if isinstance(ai_naming, dict) else "openai"
        account = str(ai_naming.get("keychainAccount", "api_key")).strip() if isinstance(ai_naming, dict) else "api_key"
        keychain_store.set_api_key(service or "openai", account or "api_key", api_key.strip())

    config_store.save(config)

    return {"saved": True}
