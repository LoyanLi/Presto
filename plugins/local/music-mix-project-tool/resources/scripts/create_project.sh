#!/bin/bash
set -euo pipefail

BASE_ROOT=""
FOLDER_NAME=""
SECTIONS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --base-root)
      BASE_ROOT="${2:-}"
      shift 2
      ;;
    --folder-name)
      FOLDER_NAME="${2:-}"
      shift 2
      ;;
    --section)
      SECTIONS+=("${2:-}")
      shift 2
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$BASE_ROOT" || -z "$FOLDER_NAME" ]]; then
  echo "base root and folder name are required" >&2
  exit 1
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"
TEMPLATES_DIR="${SCRIPT_DIR%/scripts}/templates"
PROJECT_ROOT="${BASE_ROOT%/}/${FOLDER_NAME}"

mkdir -p "$PROJECT_ROOT"
echo "CREATED_ROOT=$PROJECT_ROOT"

for SECTION in "${SECTIONS[@]}"; do
  SECTION_PATH="${PROJECT_ROOT}/${SECTION}"
  mkdir -p "$SECTION_PATH"
  echo "CREATED_DIR=$SECTION_PATH"

  if [[ "$SECTION" == "04_Documents" ]]; then
    PROJECT_NOTES_PATH="${SECTION_PATH}/00_Project_Notes.md"
    REVISION_LOG_PATH="${SECTION_PATH}/01_Revision_Log.md"
    cat "$TEMPLATES_DIR/project-notes.md" > "$PROJECT_NOTES_PATH"
    cat "$TEMPLATES_DIR/revision-log.md" > "$REVISION_LOG_PATH"
    echo "CREATED_FILE=$PROJECT_NOTES_PATH"
    echo "CREATED_FILE=$REVISION_LOG_PATH"
  fi
done
