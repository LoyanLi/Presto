from __future__ import annotations

import json
from io import BytesIO
import unittest
from unittest.mock import patch
from urllib.error import HTTPError

from presto.domain.errors import AiNamingError
from presto.domain.models import AiNamingConfig
from presto.infra.ai_naming_client import AiNamingClient


class _FakeResponse:
    def __init__(self, payload: dict) -> None:
        self._raw = json.dumps(payload).encode("utf-8")

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False

    def read(self) -> bytes:
        return self._raw


class AiNamingClientTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = AiNamingClient()
        self.config = AiNamingConfig(
            enabled=True,
            base_url="https://example.com/v1",
            model="gpt-test",
            timeout_seconds=10,
            keychain_service="svc",
            keychain_account="acc",
        )

    @patch("presto.infra.ai_naming_client.request.urlopen")
    def test_generate_names_success(self, mock_urlopen) -> None:
        mock_urlopen.return_value = _FakeResponse(
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {"items": [{"id": "0", "normalized_name": "主_vocal", "category_id": "lead_vox"}]},
                                ensure_ascii=False,
                            )
                        }
                    }
                ]
            }
        )
        result = self.client.generate_names(
            inputs=[{"id": "0", "original_stem": "1 - 0003 - 主vocal"}],
            categories=[{"id": "lead_vox", "name": "LeadVox"}],
            config=self.config,
            api_key="test-key",
        )
        self.assertEqual(
            result,
            [{"id": "0", "normalized_name": "主_vocal", "category_id": "lead_vox"}],
        )

    @patch("presto.infra.ai_naming_client.request.urlopen")
    def test_generate_names_rejects_mismatched_ids(self, mock_urlopen) -> None:
        mock_urlopen.return_value = _FakeResponse(
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {"items": [{"id": "x", "normalized_name": "name", "category_id": "drums"}]},
                                ensure_ascii=False,
                            )
                        }
                    }
                ]
            }
        )
        with self.assertRaises(AiNamingError) as ctx:
            self.client.generate_names(
                inputs=[{"id": "0", "original_stem": "kick"}],
                categories=[{"id": "drums", "name": "Drums"}],
                config=self.config,
                api_key="k",
            )
        self.assertEqual(ctx.exception.code, "AI_RESPONSE_INVALID")

    def test_generate_names_requires_key(self) -> None:
        with self.assertRaises(AiNamingError) as ctx:
            self.client.generate_names(
                inputs=[{"id": "0", "original_stem": "kick"}],
                categories=[{"id": "drums", "name": "Drums"}],
                config=self.config,
                api_key="",
            )
        self.assertEqual(ctx.exception.code, "AI_KEY_MISSING")

    @patch("presto.infra.ai_naming_client.request.urlopen")
    def test_http_authenticationrequired_has_config_hint(self, mock_urlopen) -> None:
        mock_urlopen.side_effect = HTTPError(
            url="https://example.com/v1/chat/completions",
            code=403,
            msg="Forbidden",
            hdrs=None,
            fp=BytesIO(
                b"<?xml version='1.0' encoding='UTF-8'?><Error><Code>AuthenticationRequired</Code></Error>"
            ),
        )
        with self.assertRaises(AiNamingError) as ctx:
            self.client.generate_names(
                inputs=[{"id": "0", "original_stem": "kick"}],
                categories=[{"id": "drums", "name": "Drums"}],
                config=self.config,
                api_key="k",
            )
        self.assertEqual(ctx.exception.code, "AI_API_FAILED")
        self.assertIn("Endpoint appears non-OpenAI-compatible", ctx.exception.message)

    def test_build_endpoint_accepts_full_chat_path(self) -> None:
        endpoint = self.client._build_chat_completions_endpoint("https://example.com/v1/chat/completions")
        self.assertEqual(endpoint, "https://example.com/v1/chat/completions")

    @patch("presto.infra.ai_naming_client.request.urlopen")
    def test_generate_names_rejects_invalid_category(self, mock_urlopen) -> None:
        mock_urlopen.return_value = _FakeResponse(
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {"items": [{"id": "0", "normalized_name": "Kick", "category_id": "unknown"}]}
                            )
                        }
                    }
                ]
            }
        )
        with self.assertRaises(AiNamingError) as ctx:
            self.client.generate_names(
                inputs=[{"id": "0", "original_stem": "kick"}],
                categories=[{"id": "drums", "name": "Drums"}],
                config=self.config,
                api_key="k",
            )
        self.assertEqual(ctx.exception.code, "AI_RESPONSE_INVALID")


if __name__ == "__main__":
    unittest.main()
