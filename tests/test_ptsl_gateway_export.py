from __future__ import annotations

import unittest

import presto.infra.ptsl_gateway as gateway_module
from presto.infra.ptsl_gateway import ProToolsGateway


class _CommandIdStub:
    SetTrackMuteState = 301
    SetTrackSoloState = 302


class _PtStub:
    CommandId = _CommandIdStub


class _FakeClient:
    def __init__(self) -> None:
        self.calls: list[tuple[int, dict]] = []

    def run_command(self, command_id: int, request: dict) -> None:
        self.calls.append((command_id, request))


class _FakeEngine:
    def __init__(self) -> None:
        self.client = _FakeClient()


class ProToolsGatewayExportTests(unittest.TestCase):
    def setUp(self) -> None:
        self._orig_pt = gateway_module.pt
        gateway_module.pt = _PtStub

    def tearDown(self) -> None:
        gateway_module.pt = self._orig_pt

    def test_set_track_mute_state_uses_expected_command(self) -> None:
        gateway = ProToolsGateway()
        fake_engine = _FakeEngine()
        gateway._engine = fake_engine

        gateway.set_track_mute_state(["Kick"], True)

        self.assertEqual(len(fake_engine.client.calls), 1)
        cid, payload = fake_engine.client.calls[0]
        self.assertEqual(cid, 301)
        self.assertEqual(payload["track_names"], ["Kick"])
        self.assertTrue(payload["enabled"])

    def test_set_track_solo_state_uses_expected_command(self) -> None:
        gateway = ProToolsGateway()
        fake_engine = _FakeEngine()
        gateway._engine = fake_engine

        gateway.set_track_solo_state(["Bass"], False)

        self.assertEqual(len(fake_engine.client.calls), 1)
        cid, payload = fake_engine.client.calls[0]
        self.assertEqual(cid, 302)
        self.assertEqual(payload["track_names"], ["Bass"])
        self.assertFalse(payload["enabled"])

    def test_normalize_bit_depth(self) -> None:
        self.assertEqual(ProToolsGateway._normalize_bit_depth(1), 16)
        self.assertEqual(ProToolsGateway._normalize_bit_depth(2), 24)
        self.assertEqual(ProToolsGateway._normalize_bit_depth(3), 32)
        self.assertEqual(ProToolsGateway._normalize_bit_depth("32 Float"), 32)
        self.assertEqual(ProToolsGateway._normalize_bit_depth("unknown"), 24)


if __name__ == "__main__":
    unittest.main()

