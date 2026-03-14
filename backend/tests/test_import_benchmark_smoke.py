from __future__ import annotations

import json
from pathlib import Path
import subprocess
import sys
import unittest


class ImportBenchmarkSmokeTests(unittest.TestCase):
    def test_benchmark_script_outputs_expected_schema(self) -> None:
        script_path = Path(__file__).resolve().parents[1] / "scripts" / "benchmark_import_phase4.py"
        self.assertTrue(script_path.exists(), f"Missing benchmark script: {script_path}")

        proc = subprocess.run(
            [sys.executable, str(script_path), "--tracks", "5", "--json"],
            check=True,
            capture_output=True,
            text=True,
        )
        payload = json.loads(proc.stdout)
        self.assertIsInstance(payload, dict)
        self.assertIn("scenarios", payload)
        self.assertIsInstance(payload["scenarios"], list)
        self.assertGreaterEqual(len(payload["scenarios"]), 1)

        first = payload["scenarios"][0]
        for key in ("scenario", "total_seconds", "stage_breakdown", "success_count", "failed_count"):
            self.assertIn(key, first)
        self.assertIsInstance(first["stage_breakdown"], dict)


if __name__ == "__main__":
    unittest.main()
