"""CLI entrypoint for local FastAPI server used by Electron UI."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import uvicorn


project_root = Path(__file__).resolve().parents[1]
project_root_str = str(project_root)
if project_root_str not in sys.path:
    sys.path.insert(0, project_root_str)

vendor_root = project_root / ".vendor"
vendor_root_str = str(vendor_root)
if vendor_root.exists() and vendor_root_str not in sys.path:
    sys.path.append(vendor_root_str)

from presto.web_api.server import create_app


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Presto local API")
    parser.add_argument("--host", default="127.0.0.1", help="Host to bind (default: 127.0.0.1)")
    parser.add_argument("--port", type=int, default=8000, help="Port to bind (default: 8000)")
    parser.add_argument("--reload", action="store_true", help="Enable auto-reload (dev only)")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    app = create_app()
    uvicorn.run(app, host=args.host, port=args.port, reload=args.reload, log_level="info")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
