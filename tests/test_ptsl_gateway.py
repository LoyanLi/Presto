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

    def test_detects_sample_rate_mismatch_text(self) -> None:
        self.assertTrue(ProToolsGateway._is_sample_rate_mismatch_error(RuntimeError("sample rate mismatch")))
        self.assertTrue(ProToolsGateway._is_sample_rate_mismatch_error(RuntimeError("PT_SampleRateMismatch")))
        self.assertFalse(ProToolsGateway._is_sample_rate_mismatch_error(RuntimeError("other error")))


if __name__ == "__main__":
    unittest.main()
