# Technical Architecture

This document describes the current runtime architecture used by Presto `v0.2.0`.

## 1. System Overview

Presto is a desktop app with three layers:

- Renderer UI: React + TypeScript (`frontend/src`)
- Electron main: backend manager, IPC bridge, request routing (`frontend/electron/main.mjs`)
- Python backend services (activated by mode):
  - Export mode: `backend/export/main.py`
  - Import mode: `backend/import/presto/main_api.py`

Unlike the older dual-process model, runtime is now single-active-mode: one backend process is active at a time (`export` or `import`).

## 2. Request Routing and Mode Activation

Renderer API clients still call local HTTP endpoints through Electron IPC (`window.electronAPI.http.*`).
Electron main performs two responsibilities before each request:

1. Infer expected backend mode from route path.
2. Ensure that mode is active and ready (auto-start/restart if needed).

Key implementation points:

- Gateway URL expected by renderer: `http://127.0.0.1:8000`
- Runtime port can move when occupied (port scan fallback)
- Route-to-mode inference in `inferModeFromPath(...)` inside `frontend/electron/main.mjs`
- Activation in `activateMode(...)`, readiness gate in `ensureModeAndReadinessForRequest(...)`

Health checks are mode-specific:

- Import mode: `/api/v1/system/health`
- Export mode: `/health`

## 3. Settings and Navigation Architecture

Home navigation is intentionally simplified:

- Home only exposes `Import`, `Export`, and `Settings`
- Developer page is hidden unless Developer Mode is enabled

Settings is a dedicated page with section tabs:

- `general`
- `ai`
- `developer`

Core files:

- App-level view state and developer gate: `frontend/src/App.tsx`
- Settings UI + config persistence: `frontend/src/features/settings/SettingsPage.tsx`
- Developer diagnostics page: `frontend/src/features/settings/DeveloperPage.tsx`
- i18n strings (EN/CN): `frontend/src/i18n/index.tsx`

Developer Mode is a guarded feature:

- Enabling requires explicit confirmation in Settings
- Only when enabled does Home show Developer entry
- Developer page includes backend status, shared-port update, restart, runtime logs export, and error tester

## 4. Import Workflow Internals

Primary modules:

- UI flow: `frontend/src/features/import/ImportWorkflow.tsx`
- API routes: `backend/import/presto/web_api/routes_import.py`
- Orchestrator: `backend/import/presto/app/orchestrator.py`
- UI automation: `backend/import/presto/infra/protools_ui_automation.py`

### 4.1 Analyze cache and manual edit persistence

- Per-folder AI analyze cache file: `.presto_ai_analyze.json`
- Cache auto-loads when folder is re-selected and file match succeeds
- Manual rename/category edits are debounced and persisted back to cache

### 4.2 Category editor import/export

Category editor (`frontend/src/features/settings/ConfigDialogs.tsx`) supports:

- Export JSON (normalized category payload)
- Import JSON (array or `{ categories: [] }` payload)
- Auto-normalization of IDs and color slots

### 4.3 Batch import, mismatch retry, and failure marking

Import orchestration uses category batches (default batch size `12`):

- Batch import via `gateway.import_audio_files(...)`
- If detected track count mismatches expected count, unresolved items automatically fall back to per-file retry (`gateway.import_audio_file(...)`)
- If retry still fails, failed file is marked with explicit error code/message (`TRACK_DETECTION_FAILED`)

This is implemented in `ImportOrchestrator._run_pipeline(...)` and surfaced in UI as first-failure summary.

### 4.4 Strip Silence behavior safety

Strip Silence open is preflighted once via `open_strip_silence_window()`.
The open action first checks whether Strip Silence window already exists before sending Cmd+U, preventing toggle-close behavior.

## 5. Export Workflow, Progress, and Mobile Read-only View

Primary modules:

- Export UI: `frontend/src/features/export/track2do/components/ExportPanel.tsx`
- Export backend routes: `backend/export/api/routes.py`
- Progress math: `backend/export/api/progress_metrics.py`, `frontend/src/utils/progressEta.ts`

### 5.1 Progress and ETA model

- Backend reports snapshot-aware overall progress and ETA (`eta_seconds`)
- Frontend keeps a monotonic rendered progress (`smoothProgress`) to avoid backward jumps
- Early run state (especially first snapshot) displays ETA as "calculating" instead of unstable estimates

### 5.2 Mobile progress sessions

Electron main provides temporary read-only mobile progress links:

- Session management: `frontend/electron/mobileProgressSession.mjs`
- Mobile payload mapping: `frontend/electron/mobileProgressPayload.mjs`
- Embedded mobile viewer server/routes: `frontend/electron/main.mjs`
- Renderer bridge: `export-mobile:create-session`, `export-mobile:close-session`, `export-mobile:get-view-url`

Properties:

- LAN-only viewing (same network expected)
- Read-only status/progress display
- Session token required in URL path

## 6. Error Handling and Localization

Error handling is layered:

- Backend emits structured payloads (`error_code`, `message`, optional `friendly`, `details`)
- Electron wraps fetch/transient failures with retry + timeout behavior
- Renderer normalizes all errors through `normalizeAppError(...)`

Localization:

- Friendly messages/actions are available in English and Simplified Chinese
- Error tester on Developer page validates and previews localized error cards

## 7. Configuration and Runtime Data

Import-side persistent config is managed by `ConfigStore` in import backend and stored under app support path.
In dev, default app support path is repo-local `.presto/` unless overridden.

Runtime artifacts include:

- `.presto/`
- `backend/export/logs/`
- `backend/export/output/`
- `backend/export/temp/`
- `.presto_ai_analyze.json` in selected source folders

## 8. Process Lifecycle and Diagnostics

Electron main (`main.mjs`) owns lifecycle:

- Startup mode activation
- Heartbeat health checks
- Auto-restart on repeated failures (bounded window)
- Runtime status/log export for diagnostics
- Graceful shutdown of active backend and mobile progress server

## 9. Extending API Domains (Current Pattern)

When adding new backend domain routes:

1. Define route ownership (import mode or export mode).
2. Register route pattern so `inferModeFromPath(...)` maps request to correct mode.
3. Add/update renderer API module.
4. Verify mode activation + request readiness path in Electron.
5. Add tests and update docs.

## 10. Testing Matrix

Minimum checks:

```bash
npm --prefix frontend run typecheck
pytest -q backend/tests/test_ai_rename_service.py backend/tests/test_config_store.py
```

Recommended additional checks by change type:

```bash
# Import orchestrator / batch retry / strip behavior
pytest -q backend/tests/test_orchestrator_integration.py

# Import task stop/status/progress endpoints
pytest -q backend/tests/test_import_run_stop.py backend/tests/test_import_routes_status.py backend/tests/test_import_progress_metrics.py

# Export progress + ETA
pytest -q backend/tests/test_export_progress_metrics.py backend/tests/test_export_routes_status_eta.py

# Electron main syntax check
node --check frontend/electron/main.mjs
```

## 11. Known Constraints

- macOS-only automation assumptions
- Pro Tools accessibility permissions required
- Strip/color UI automation depends on English Pro Tools UI labels
- Mode switching introduces startup latency on first request of a different domain
