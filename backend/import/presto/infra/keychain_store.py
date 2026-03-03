"""macOS Keychain access for API credentials."""

from __future__ import annotations

import subprocess

from presto.domain.errors import AiNamingError


class KeychainStore:
    """Read/write API keys via macOS `security` CLI."""

    def set_api_key(self, service: str, account: str, key: str) -> None:
        try:
            subprocess.run(
                [
                    "security",
                    "add-generic-password",
                    "-a",
                    account,
                    "-s",
                    service,
                    "-w",
                    key,
                    "-U",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError as exc:
            message = (exc.stderr or exc.stdout or str(exc)).strip()
            raise AiNamingError("AI_CONFIG_INVALID", f"Failed to store API key in Keychain: {message}") from exc

    def get_api_key(self, service: str, account: str) -> str | None:
        try:
            proc = subprocess.run(
                [
                    "security",
                    "find-generic-password",
                    "-a",
                    account,
                    "-s",
                    service,
                    "-w",
                ],
                check=True,
                capture_output=True,
                text=True,
            )
            key = (proc.stdout or "").strip()
            return key or None
        except subprocess.CalledProcessError as exc:
            message = (exc.stderr or exc.stdout or "").lower()
            if "could not be found" in message or "item not found" in message:
                return None
            raw = (exc.stderr or exc.stdout or str(exc)).strip()
            raise AiNamingError("AI_CONFIG_INVALID", f"Failed to read API key from Keychain: {raw}") from exc

    def delete_api_key(self, service: str, account: str) -> None:
        try:
            subprocess.run(
                [
                    "security",
                    "delete-generic-password",
                    "-a",
                    account,
                    "-s",
                    service,
                ],
                check=True,
                capture_output=True,
                text=True,
            )
        except subprocess.CalledProcessError as exc:
            message = (exc.stderr or exc.stdout or "").lower()
            if "could not be found" in message or "item not found" in message:
                return
            raw = (exc.stderr or exc.stdout or str(exc)).strip()
            raise AiNamingError("AI_CONFIG_INVALID", f"Failed to delete API key from Keychain: {raw}") from exc
