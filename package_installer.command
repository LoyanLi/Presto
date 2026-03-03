#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT_DIR"

echo "== Presto macOS installer build =="
echo "Project: $ROOT_DIR"
echo

if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed."
  echo "Install Node.js 18+ and retry."
  read -r -p "Press Enter to exit..." _
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed."
  read -r -p "Press Enter to exit..." _
  exit 1
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "[1/3] Installing frontend dependencies..."
  npm --prefix frontend install
else
  echo "[1/3] Dependencies already installed."
fi

echo "[2/3] Building DMG installers (arm64 + x64)..."
npm --prefix frontend run package:mac:installer

echo "[3/3] Done."
echo "Installer output: $ROOT_DIR/frontend/release"

if [ -d "$ROOT_DIR/frontend/release" ]; then
  open "$ROOT_DIR/frontend/release" >/dev/null 2>&1 || true
fi

echo
echo "Note: This build is unsigned (identity=null)."
echo "For public distribution, add mac signing/notarization."
read -r -p "Press Enter to exit..." _
