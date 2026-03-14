#!/usr/bin/env bash
set -euo pipefail

# Incrementally sync new git commits into an Obsidian note.
#
# Defaults:
# - vault: Note
# - note path: 开发/Presto/提交记录.md
# - repo dir: current git repo root
#
# Usage:
#   ./scripts/obsidian_commit_sync.sh
#   OBSIDIAN_VAULT="Note" OBSIDIAN_NOTE_PATH="开发/Presto/提交记录.md" ./scripts/obsidian_commit_sync.sh

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${REPO_ROOT}" ]]; then
  echo "Error: current directory is not inside a git repository." >&2
  exit 1
fi

OBSIDIAN_BIN="${OBSIDIAN_BIN:-$(command -v obsidian || true)}"
if [[ -z "${OBSIDIAN_BIN}" && -x "/Applications/Obsidian.app/Contents/MacOS/obsidian" ]]; then
  OBSIDIAN_BIN="/Applications/Obsidian.app/Contents/MacOS/obsidian"
fi

if [[ -z "${OBSIDIAN_BIN}" ]]; then
  echo "Error: obsidian CLI binary not found. Set OBSIDIAN_BIN first." >&2
  exit 1
fi

OBSIDIAN_VAULT="${OBSIDIAN_VAULT:-Note}"
OBSIDIAN_NOTE_PATH="${OBSIDIAN_NOTE_PATH:-开发/Presto/提交记录.md}"

NOTE_CONTENT="$("${OBSIDIAN_BIN}" "vault=${OBSIDIAN_VAULT}" read "path=${OBSIDIAN_NOTE_PATH}" 2>/dev/null || true)"
if [[ -z "${NOTE_CONTENT}" ]]; then
  echo "Error: failed to read note '${OBSIDIAN_NOTE_PATH}' from vault '${OBSIDIAN_VAULT}'." >&2
  exit 1
fi

EXISTING_HASHES="$(printf '%s\n' "${NOTE_CONTENT}" | grep -oE '`[0-9a-f]{7,40}`' | tr -d '`' || true)"

GIT_LINES="$(git -C "${REPO_ROOT}" log --reverse --date=short --pretty=format:'%h|%ad|%s')"
if [[ -z "${GIT_LINES}" ]]; then
  echo "No commits found."
  exit 0
fi

NEW_ROWS=""
NEW_COUNT=0

while IFS='|' read -r hash commit_date subject; do
  if [[ -z "${hash}" ]]; then
    continue
  fi

  if [[ -n "${EXISTING_HASHES}" ]] && printf '%s\n' "${EXISTING_HASHES}" | grep -qx "${hash}"; then
    continue
  fi

  commit_type="${subject%%:*}"
  commit_summary="${subject}"
  if [[ "${subject}" == *": "* ]]; then
    commit_summary="${subject#*: }"
  fi

  NEW_ROWS="${NEW_ROWS}| ${commit_date} | \`${hash}\` | ${commit_type} | ${commit_summary} |\n"
  NEW_COUNT=$((NEW_COUNT + 1))
done <<< "${GIT_LINES}"

if [[ "${NEW_COUNT}" -eq 0 ]]; then
  echo "No new commits to sync."
  exit 0
fi

STAMP="$(date '+%Y-%m-%d %H:%M:%S')"
APPEND_BLOCK="$(cat <<EOF

## 增量更新 ${STAMP}
| 日期 | Commit | 类型 | 摘要 |
|---|---|---|---|
$(printf '%b' "${NEW_ROWS}")
EOF
)"

"${OBSIDIAN_BIN}" "vault=${OBSIDIAN_VAULT}" append "path=${OBSIDIAN_NOTE_PATH}" "content=${APPEND_BLOCK}"

echo "Synced ${NEW_COUNT} new commit(s) to ${OBSIDIAN_NOTE_PATH}."
