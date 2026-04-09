from __future__ import annotations

from dataclasses import dataclass, field
import subprocess

from ..domain.ports import KeychainStorePort


@dataclass
class InMemoryKeychainStore:
    values: dict[tuple[str, str], str] = field(default_factory=dict)

    def get_api_key(self, service: str, account: str) -> str | None:
        return self.values.get((service, account))

    def set_api_key(self, service: str, account: str, api_key: str) -> None:
        self.values[(service, account)] = api_key

    def delete_api_key(self, service: str, account: str) -> None:
        self.values.pop((service, account), None)


class MacOsKeychainStore:
    def __init__(self, *, run_security=None) -> None:
        self._run_security = run_security or self._default_run_security

    @staticmethod
    def _default_run_security(args: list[str], input_text: str | None = None) -> str:
        result = subprocess.run(
            ["security", *args],
            input=input_text,
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(result.stderr.strip() or result.stdout.strip() or "security_command_failed")
        return result.stdout.strip()

    def get_api_key(self, service: str, account: str) -> str | None:
        try:
            return self._run_security(["find-generic-password", "-w", "-s", service, "-a", account])
        except RuntimeError:
            return None

    def set_api_key(self, service: str, account: str, api_key: str) -> None:
        self._run_security(
            ["add-generic-password", "-U", "-s", service, "-a", account, "-w"],
            input_text=api_key,
        )

    def delete_api_key(self, service: str, account: str) -> None:
        try:
            self._run_security(["delete-generic-password", "-s", service, "-a", account])
        except RuntimeError:
            return


def create_default_keychain_store() -> KeychainStorePort:
    return MacOsKeychainStore()
