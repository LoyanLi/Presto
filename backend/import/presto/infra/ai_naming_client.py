"""Compatible OpenAI-style client for batch file-name normalization."""

from __future__ import annotations

import json
from typing import Any
from urllib import error, request

from presto.domain.errors import AiNamingError
from presto.domain.models import AiNamingConfig


class AiNamingClient:
    """Call chat-completions endpoint and return structured rename candidates."""

    def generate_names(
        self,
        inputs: list[dict[str, str]],
        categories: list[dict[str, str]],
        config: AiNamingConfig,
        api_key: str,
    ) -> list[dict[str, str]]:
        if not config.base_url.strip() or not config.model.strip():
            raise AiNamingError("AI_CONFIG_INVALID", "AI base URL and model are required.")
        if not api_key.strip():
            raise AiNamingError("AI_KEY_MISSING", "AI API key is missing.")
        if not categories:
            raise AiNamingError("AI_CONFIG_INVALID", "No categories available for AI classification.")

        endpoint = self._build_chat_completions_endpoint(config.base_url)
        payload = {
            "model": config.model,
            "temperature": 0,
            "messages": [
                {
                    "role": "system",
                    "content": (
                        "You normalize audio track names. Return strict JSON only. "
                        "You must choose one best category_id from the provided categories for each item. "
                        "Classify from filename semantics only; do not blindly keep defaults. "
                        "Do not invent instrument meaning. "
                        "Always output normalized_name in English; translate non-English words to concise natural English while preserving meaning. "
                        "Use underscore style like Word_Word_Word. Remove noisy serial fragments. "
                        "Use Title Case for each English token."
                    ),
                },
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "categories": categories,
                            "items": inputs,
                            "output_schema": {
                                "items": [
                                    {"id": "string", "normalized_name": "string", "category_id": "string"}
                                ]
                            },
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
            "response_format": {"type": "json_object"},
        }
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")

        req = request.Request(
            endpoint,
            data=body,
            method="POST",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
        )

        try:
            with request.urlopen(req, timeout=config.timeout_seconds) as resp:
                raw = resp.read().decode("utf-8")
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace").strip()
            message = detail or str(exc)
            hint = ""
            lowered = message.lower()
            if "authenticationrequired" in lowered:
                hint = (
                    " Endpoint appears non-OpenAI-compatible. "
                    "Set Base URL to the API root (usually ending with /v1), not a file/share URL."
                )
            elif exc.code in (401, 403):
                hint = " Check API key, model name, and provider auth requirements."
            raise AiNamingError(
                "AI_API_FAILED",
                f"AI API HTTP {exc.code} error: {message}{hint}",
            ) from exc
        except Exception as exc:
            raise AiNamingError("AI_API_FAILED", f"AI API request failed: {exc}") from exc

        allowed_category_ids = {item["id"] for item in categories}
        return self._parse_response(
            raw=raw,
            expected_ids={item["id"] for item in inputs},
            allowed_category_ids=allowed_category_ids,
        )

    @staticmethod
    def _build_chat_completions_endpoint(base_url: str) -> str:
        trimmed = base_url.strip()
        lowered = trimmed.lower().rstrip("/")
        if lowered.endswith("/chat/completions"):
            return trimmed.rstrip("/")
        return trimmed.rstrip("/") + "/chat/completions"

    def _parse_response(
        self,
        raw: str,
        expected_ids: set[str],
        allowed_category_ids: set[str],
    ) -> list[dict[str, str]]:
        try:
            payload = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise AiNamingError("AI_RESPONSE_INVALID", f"AI API did not return JSON: {exc}") from exc

        content = self._extract_message_content(payload)
        try:
            structured = json.loads(content)
        except json.JSONDecodeError as exc:
            raise AiNamingError("AI_RESPONSE_INVALID", f"AI content is not valid JSON: {exc}") from exc

        items = structured.get("items")
        if not isinstance(items, list):
            raise AiNamingError("AI_RESPONSE_INVALID", "AI response missing 'items' array.")

        seen_ids: set[str] = set()
        result: list[dict[str, str]] = []
        for item in items:
            if not isinstance(item, dict):
                raise AiNamingError("AI_RESPONSE_INVALID", "AI response item must be an object.")
            item_id = str(item.get("id", "")).strip()
            normalized_name = str(item.get("normalized_name", "")).strip()
            category_id = str(item.get("category_id", "")).strip()
            if not item_id or not normalized_name or not category_id:
                raise AiNamingError(
                    "AI_RESPONSE_INVALID",
                    "AI response item has empty id, normalized_name, or category_id.",
                )
            if item_id in seen_ids:
                raise AiNamingError("AI_RESPONSE_INVALID", f"Duplicate id in AI response: {item_id}")
            if category_id not in allowed_category_ids:
                raise AiNamingError(
                    "AI_RESPONSE_INVALID",
                    f"AI response category_id is not in available categories: {category_id}",
                )
            seen_ids.add(item_id)
            result.append({"id": item_id, "normalized_name": normalized_name, "category_id": category_id})

        if seen_ids != expected_ids:
            raise AiNamingError(
                "AI_RESPONSE_INVALID",
                "AI response ids mismatch input ids.",
            )
        return result

    @staticmethod
    def _extract_message_content(payload: dict[str, Any]) -> str:
        choices = payload.get("choices")
        if not isinstance(choices, list) or not choices:
            raise AiNamingError("AI_RESPONSE_INVALID", "AI response missing choices.")
        first = choices[0]
        if not isinstance(first, dict):
            raise AiNamingError("AI_RESPONSE_INVALID", "AI response choice must be an object.")
        message = first.get("message")
        if not isinstance(message, dict):
            raise AiNamingError("AI_RESPONSE_INVALID", "AI response missing message object.")
        content = message.get("content")
        if isinstance(content, str):
            text = content.strip()
            if not text:
                raise AiNamingError("AI_RESPONSE_INVALID", "AI response message content is empty.")
            return text

        # Some providers may return content as structured list blocks.
        if isinstance(content, list):
            parts: list[str] = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    text = str(block.get("text", "")).strip()
                    if text:
                        parts.append(text)
            joined = "\n".join(parts).strip()
            if joined:
                return joined

        raise AiNamingError("AI_RESPONSE_INVALID", "AI response message content missing.")
