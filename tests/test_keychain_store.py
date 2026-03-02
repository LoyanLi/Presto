from __future__ import annotations

import subprocess
import unittest
from unittest.mock import patch

from presto.domain.errors import AiNamingError
from presto.infra.keychain_store import KeychainStore


class KeychainStoreTests(unittest.TestCase):
    @patch("presto.infra.keychain_store.subprocess.run")
    def test_get_api_key_returns_value(self, mock_run) -> None:
        mock_run.return_value = subprocess.CompletedProcess(args=[], returncode=0, stdout="abc\n", stderr="")
        store = KeychainStore()
        self.assertEqual(store.get_api_key("svc", "acc"), "abc")

    @patch("presto.infra.keychain_store.subprocess.run")
    def test_get_api_key_not_found_returns_none(self, mock_run) -> None:
        mock_run.side_effect = subprocess.CalledProcessError(
            returncode=44,
            cmd=["security"],
            stderr="The specified item could not be found in the keychain.",
        )
        store = KeychainStore()
        self.assertIsNone(store.get_api_key("svc", "acc"))

    @patch("presto.infra.keychain_store.subprocess.run")
    def test_set_api_key_raises_structured_error(self, mock_run) -> None:
        mock_run.side_effect = subprocess.CalledProcessError(
            returncode=1,
            cmd=["security"],
            stderr="denied",
        )
        store = KeychainStore()
        with self.assertRaises(AiNamingError) as ctx:
            store.set_api_key("svc", "acc", "key")
        self.assertEqual(ctx.exception.code, "AI_CONFIG_INVALID")


if __name__ == "__main__":
    unittest.main()
