"""Common routes for web API."""

from __future__ import annotations

from dataclasses import asdict

from fastapi import APIRouter, HTTPException, Request

from presto.domain.models import (
    AiNamingConfig,
    AppConfig,
    CategoryTemplate,
    SilenceProfile,
    UiPreferences,
)
from presto.web_api.dependencies import get_services
from presto.web_api.schemas import BaseResponse
from presto.web_api.schemas import AiKeyUpdateRequest, ConfigUpdateRequest


router = APIRouter()


@router.get("/system/health")
def health(request: Request):
    services = get_services(request)
    ptsl_connected = False
    try:
        services.gateway.connect()
        services.gateway.ensure_session_open()
        ptsl_connected = True
    except Exception:
        ptsl_connected = False
    return {
        "success": True,
        "message": "ok",
        "ptsl_connected": ptsl_connected,
    }


@router.get("/config")
def get_config(request: Request):
    services = get_services(request)
    cfg = services.config_store.load()
    return {
        "success": True,
        "message": "ok",
        "data": {
            "categories": [asdict(category) for category in cfg.categories],
            "silence_profile": asdict(cfg.silence_profile),
            "ai_naming": {
                "enabled": cfg.ai_naming.enabled,
                "base_url": cfg.ai_naming.base_url,
                "model": cfg.ai_naming.model,
                "timeout_seconds": cfg.ai_naming.timeout_seconds,
                "keychain_service": cfg.ai_naming.keychain_service,
                "keychain_account": cfg.ai_naming.keychain_account,
            },
            "ui_preferences": asdict(cfg.ui_preferences),
        },
    }


@router.put("/config", response_model=BaseResponse)
def update_config(payload: ConfigUpdateRequest, request: Request):
    services = get_services(request)
    existing = services.config_store.load()

    categories = [
        CategoryTemplate(
            id=item.id.strip(),
            name=item.name.strip(),
            pt_color_slot=int(item.pt_color_slot),
            preview_hex=item.preview_hex or "#000000",
        )
        for item in payload.categories
        if item.id.strip() and item.name.strip()
    ]
    if not categories:
        raise HTTPException(status_code=400, detail="At least one category is required.")

    config = AppConfig(
        version=existing.version,
        categories=categories,
        silence_profile=SilenceProfile(
            threshold_db=float(payload.silence_profile.threshold_db),
            min_strip_ms=int(payload.silence_profile.min_strip_ms),
            min_silence_ms=int(payload.silence_profile.min_silence_ms),
            start_pad_ms=int(payload.silence_profile.start_pad_ms),
            end_pad_ms=int(payload.silence_profile.end_pad_ms),
        ),
        ai_naming=AiNamingConfig(
            enabled=bool(payload.ai_naming.enabled),
            base_url=str(payload.ai_naming.base_url).strip(),
            model=str(payload.ai_naming.model).strip(),
            timeout_seconds=max(1, int(payload.ai_naming.timeout_seconds)),
            keychain_service=str(payload.ai_naming.keychain_service).strip(),
            keychain_account=str(payload.ai_naming.keychain_account).strip(),
        ),
        ui_preferences=UiPreferences(
            logs_collapsed_by_default=bool(payload.ui_preferences.logs_collapsed_by_default),
            follow_system_theme=bool(payload.ui_preferences.follow_system_theme),
            developer_mode_enabled=bool(payload.ui_preferences.developer_mode_enabled),
        ),
    )
    services.config_store.save(config)

    if payload.api_key is not None:
        api_key = payload.api_key.strip()
        if api_key:
            services.keychain_store.set_api_key(config.ai_naming.keychain_service, config.ai_naming.keychain_account, api_key)
        else:
            services.keychain_store.delete_api_key(config.ai_naming.keychain_service, config.ai_naming.keychain_account)

    return BaseResponse(success=True, message="Config updated.")


@router.get("/ai/key/status")
def get_ai_key_status(request: Request):
    services = get_services(request)
    cfg = services.config_store.load()
    api_key = services.keychain_store.get_api_key(cfg.ai_naming.keychain_service, cfg.ai_naming.keychain_account)
    return {
        "success": True,
        "message": "ok",
        "has_key": bool(api_key),
    }


@router.post("/ai/key", response_model=BaseResponse)
def set_ai_key(payload: AiKeyUpdateRequest, request: Request):
    services = get_services(request)
    cfg = services.config_store.load()
    services.keychain_store.set_api_key(
        cfg.ai_naming.keychain_service,
        cfg.ai_naming.keychain_account,
        payload.api_key.strip(),
    )
    return BaseResponse(success=True, message="AI key stored in Keychain.")


@router.post("/session/save", response_model=BaseResponse)
def save_session(request: Request):
    services = get_services(request)
    try:
        services.gateway.save_session()
        return BaseResponse(success=True, message="Session saved.")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
