from __future__ import annotations

import sys
from pathlib import Path


IMPORT_BACKEND_ROOT = Path(__file__).resolve().parents[1] / "import"
if str(IMPORT_BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(IMPORT_BACKEND_ROOT))
