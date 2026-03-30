#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SOURCE_ICON="$ROOT_DIR/assets/App.icon"
TARGET_DIR="$ROOT_DIR/frontend/build"
TARGET_ICON="$TARGET_DIR/App.icon"

if [ ! -d "$SOURCE_ICON" ]; then
  echo "[prepare_icon] Source .icon not found: $SOURCE_ICON"
  echo "[prepare_icon] Skip icon sync."
  exit 0
fi

mkdir -p "$TARGET_DIR"
rm -rf "$TARGET_ICON"
cp -R "$SOURCE_ICON" "$TARGET_ICON"
echo "[prepare_icon] Synced icon bundle: $TARGET_ICON"
