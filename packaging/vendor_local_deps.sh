#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

python3 packaging/vendor_local_deps.py

echo "Local vendor complete. Launch with:"
echo "  npm --prefix web run dev"
