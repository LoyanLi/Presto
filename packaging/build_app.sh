#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if npm --prefix frontend run | grep -q "package:mac"; then
  npm --prefix frontend run package:mac
  exit 0
fi

echo "Python (PyQt) frontend packaging has been removed."
echo "Use Web/Electron build pipeline instead."
echo "Tip: add a frontend/package:mac script and rerun this command."
exit 1
