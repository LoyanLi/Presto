from __future__ import annotations

import unittest

import presto.infra.ptsl_gateway as gateway_module
from presto.infra.ptsl_gateway import ProToolsGateway


class _PtStub:
    CopyAudio = 11
    ConvertAudio = 22
    MD_NewTrack = 3
    ML_SessionStart = 2


class _FakeEngine:
    def __init__(self, fail_first: bool = False) -> None:
        self.fail_first = fail_first
        self.calls: list[int] = []

    def import_audio(self, **kwargs) -> None:
        self.calls.append(int(kwargs["audio_operations"]))
        if self.fail_first and len(self.calls) == 1:
            raise RuntimeError("PT_SampleRateMismatch")


class _FakeColorClient:
    def __init__(self, fail_batch_only: bool = False) -> None:
        self.fail_batch_only = fail_batch_only
        self.calls: list[tuple[int, dict]] = []

    def run_command(self, command_id: int, request: dict):
        self.calls.append((command_id, request))
        track_names = request.get("track_names", [])
        if self.fail_batch_only and len(track_names) > 1:
            raise RuntimeError("batch color failed")
        return {"success_count": len(track_names)}


class _FakeColorEngine:
    def __init__(self, fail_batch_only: bool = False) -> None:
        self.client = _FakeColorClient(fail_batch_only=fail_batch_only)


class ProToolsGatewayTests(unittest.TestCase):
    def setUp(self) -> None:
        self._orig_pt = gateway_module.pt
        gateway_module.pt = _PtStub

    def tearDown(self) -> None:
        gateway_module.pt = self._orig_pt

    def test_import_auto_fallbacks_to_convert_on_sample_rate_mismatch(self) -> None:
        gateway = ProToolsGateway()
        engine = _FakeEngine(fail_first=True)
        gateway._engine = engine

        snapshots = [
            ["Existing"],
            ["Existing", "Imported Track"],
        ]
        gateway.list_track_names = lambda: snapshots.pop(0)  # type: ignore[method-assign]

        track_name = gateway.import_audio_file("/tmp/kick.wav")

        self.assertEqual(track_name, "Imported Track")
        self.assertEqual(engine.calls, [_PtStub.CopyAudio, _PtStub.ConvertAudio])

    def test_import_uses_copy_when_no_sample_rate_mismatch(self) -> None:
        gateway = ProToolsGateway()
        engine = _FakeEngine(fail_first=False)
        gateway._engine = engine

        snapshots = [
            ["Existing"],
            ["Existing", "Imported Track"],
        ]
        gateway.list_track_names = lambda: snapshots.pop(0)  # type: ignore[method-assign]

        track_name = gateway.import_audio_file("/tmp/snare.wav")

        self.assertEqual(track_name, "Imported Track")
        self.assertEqual(engine.calls, [_PtStub.CopyAudio])

    def test_import_audio_files_allows_partial_detection_on_batch_mismatch(self) -> None:
        gateway = ProToolsGateway()
        engine = _FakeEngine(fail_first=False)
        gateway._engine = engine

        snapshots = [
            ["Existing"],
            ["Existing", "Imported A", "Imported B"],
        ]
        gateway.list_track_names = lambda: snapshots.pop(0)  # type: ignore[method-assign]

        imported = gateway.import_audio_files(["/tmp/a.wav", "/tmp/b.wav", "/tmp/c.wav"])

        self.assertEqual(imported, ["Imported A", "Imported B"])
        self.assertEqual(engine.calls, [_PtStub.CopyAudio])

    def test_detects_sample_rate_mismatch_text(self) -> None:
        self.assertTrue(ProToolsGateway._is_sample_rate_mismatch_error(RuntimeError("sample rate mismatch")))
        self.assertTrue(ProToolsGateway._is_sample_rate_mismatch_error(RuntimeError("PT_SampleRateMismatch")))
        self.assertFalse(ProToolsGateway._is_sample_rate_mismatch_error(RuntimeError("other error")))

    def test_apply_track_color_batch_groups_track_names(self) -> None:
        gateway = ProToolsGateway()
        gateway._engine = _FakeColorEngine(fail_batch_only=False)
        gateway._set_track_color_command_id = 153

        gateway.apply_track_color_batch(slot=9, track_names=["Kick", "Snare", "Bass"])

        calls = gateway._engine.client.calls  # type: ignore[union-attr]
        self.assertEqual(len(calls), 1)
        command_id, request = calls[0]
        self.assertEqual(command_id, 153)
        self.assertEqual(request["track_names"], ["Kick", "Snare", "Bass"])
        self.assertEqual(request["color_index"], 9)

    def test_apply_track_color_batch_fallbacks_to_single_track(self) -> None:
        gateway = ProToolsGateway()
        gateway._engine = _FakeColorEngine(fail_batch_only=True)
        gateway._set_track_color_command_id = 153

        gateway.apply_track_color_batch(slot=6, track_names=["Kick", "Snare"])

        calls = gateway._engine.client.calls  # type: ignore[union-attr]
        self.assertEqual(len(calls), 3)
        self.assertEqual(calls[0][1]["track_names"], ["Kick", "Snare"])
        self.assertEqual(calls[1][1]["track_names"], ["Kick"])
        self.assertEqual(calls[2][1]["track_names"], ["Snare"])


if __name__ == "__main__":
    unittest.main()
