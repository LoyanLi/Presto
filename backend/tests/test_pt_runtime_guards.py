from __future__ import annotations

import unittest

from presto.domain.errors import GatewayError
from presto.infra.ptsl_gateway import ProToolsGateway


class _EngineWithVersionAndSelection:
    def __init__(self, version: str, selected: list[str] | None = None) -> None:
        self._version = version
        self._selected = selected or []

    def host_version(self) -> str:
        return self._version

    def selected_track_names(self) -> list[str]:
        return list(self._selected)


class ProToolsRuntimeGuardTests(unittest.TestCase):
    def test_ensure_minimum_version_rejects_older_build(self) -> None:
        gateway = ProToolsGateway()
        gateway._engine = _EngineWithVersionAndSelection(version="2024.12")

        with self.assertRaises(GatewayError) as ctx:
            gateway.ensure_minimum_version(min_supported="2025.10")

        self.assertEqual(ctx.exception.code, "PT_VERSION_UNSUPPORTED")
        self.assertIn("2025.10", ctx.exception.message)

    def test_ensure_minimum_version_accepts_supported_build(self) -> None:
        gateway = ProToolsGateway()
        gateway._engine = _EngineWithVersionAndSelection(version="2025.11")

        detected = gateway.ensure_minimum_version(min_supported="2025.10")

        self.assertEqual(detected, "2025.11")

    def test_ensure_minimum_version_fails_when_version_unknown(self) -> None:
        class _EngineWithoutVersion:
            pass

        gateway = ProToolsGateway()
        gateway._engine = _EngineWithoutVersion()

        with self.assertRaises(GatewayError) as ctx:
            gateway.ensure_minimum_version(min_supported="2025.10")

        self.assertEqual(ctx.exception.code, "PT_VERSION_UNKNOWN")

    def test_ensure_any_track_selected_rejects_empty_selection(self) -> None:
        gateway = ProToolsGateway()
        gateway._engine = _EngineWithVersionAndSelection(version="2025.10", selected=[])

        with self.assertRaises(GatewayError) as ctx:
            gateway.ensure_any_track_selected()

        self.assertEqual(ctx.exception.code, "NO_TRACK_SELECTED")
        self.assertIn("Select at least one track", ctx.exception.message)

    def test_ensure_any_track_selected_returns_selected_names(self) -> None:
        gateway = ProToolsGateway()
        gateway._engine = _EngineWithVersionAndSelection(version="2025.10", selected=["Kick", "Snare"])

        selected = gateway.ensure_any_track_selected()

        self.assertEqual(selected, ["Kick", "Snare"])


if __name__ == "__main__":
    unittest.main()
