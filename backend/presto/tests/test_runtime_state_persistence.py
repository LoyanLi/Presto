from __future__ import annotations

from pathlib import Path

from presto.application.handlers.context import build_execution_context
from presto.application.handlers.config import update_config_payload
from presto.application.service_container import build_service_container
from presto.integrations.config_store import create_default_app_config
from presto.integrations.keychain_store import MacOsKeychainStore


class FakeSecurityRunner:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []
        self.passwords: dict[tuple[str, str], str] = {}

    def __call__(self, args: list[str], input_text: str | None = None) -> str:
        self.calls.append(args)

        if args[:2] == ["add-generic-password", "-U"]:
            service = args[args.index("-s") + 1]
            account = args[args.index("-a") + 1]
            self.passwords[(service, account)] = input_text or ""
            return ""

        if args[:1] == ["find-generic-password"]:
            service = args[args.index("-s") + 1]
            account = args[args.index("-a") + 1]
            return self.passwords[(service, account)]

        if args[:1] == ["delete-generic-password"]:
            service = args[args.index("-s") + 1]
            account = args[args.index("-a") + 1]
            self.passwords.pop((service, account), None)
            return ""

        raise AssertionError(f"Unexpected security command: {args}")


def test_default_runtime_config_persists_across_service_container_rebuilds(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("PRESTO_APP_DATA_DIR", str(tmp_path))

    services = build_service_container()
    config = services.config_store.load()
    config["uiPreferences"]["developerModeEnabled"] = False
    config["hostPreferences"]["language"] = "zh-CN"
    config["hostPreferences"]["dawTarget"] = "pro_tools"
    config["hostPreferences"]["includePrereleaseUpdates"] = True

    update_config_payload(
        build_execution_context(services, request_id="req-runtime-config"),
        {"config": config},
    )

    rebuilt_services = build_service_container()
    rebuilt_config = rebuilt_services.config_store.load()

    assert rebuilt_config["uiPreferences"]["developerModeEnabled"] is False
    assert rebuilt_config["hostPreferences"]["language"] == "zh-CN"
    assert rebuilt_config["hostPreferences"]["dawTarget"] == "pro_tools"
    assert rebuilt_config["hostPreferences"]["includePrereleaseUpdates"] is True


def test_default_runtime_config_creates_backing_file_on_first_load(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("PRESTO_APP_DATA_DIR", str(tmp_path))

    services = build_service_container()
    config = services.config_store.load()

    config_path = tmp_path / "config.json"
    assert config_path.exists() is True
    assert config["hostPreferences"] == create_default_app_config()["hostPreferences"]
    assert config["hostPreferences"]["includePrereleaseUpdates"] is False


def test_build_execution_context_exposes_default_execution_logger(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("PRESTO_APP_DATA_DIR", str(tmp_path))

    services = build_service_container()
    context = build_execution_context(services, request_id="req-runtime-logger")

    assert context.logger is not None


def test_macos_keychain_store_uses_security_cli_contract() -> None:
    runner = FakeSecurityRunner()
    store = MacOsKeychainStore(run_security=runner)

    store.set_api_key("openai", "api_key", "sk-test")

    assert store.get_api_key("openai", "api_key") == "sk-test"
    store.delete_api_key("openai", "api_key")
    assert ("openai", "api_key") not in runner.passwords

    assert runner.calls[0][:4] == ["add-generic-password", "-U", "-s", "openai"]
    assert runner.calls[1][:4] == ["find-generic-password", "-w", "-s", "openai"]
    assert runner.calls[2][:5] == ["delete-generic-password", "-s", "openai", "-a", "api_key"]
