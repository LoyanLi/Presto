# Technical Architecture

This document explains Presto internals for maintainers and contributors.

## 1. System Overview

Presto runs as a desktop application with three runtime layers:

- Renderer: React UI (`web/src`)
- Electron main process: process lifecycle + request routing (`web/electron/main.ts`, `main.mjs`)
- Local Python services:
  - Export/session service: `track2do_backend` (`:8000`)
  - Import/config service: `presto.main_api` (`:8001`)

## 2. Request Routing Model

Renderer-side clients call `http://127.0.0.1:8000` through Electron IPC (`window.electronAPI.http.*`).
Electron main decides whether a request stays on `8000` or is forwarded to `8001` using route rules.

Routing config is in:

- `web/electron/main.ts`
- `web/electron/main.mjs`

Rules are grouped by frontend API entry names:

- `importApi` -> `8001`
- `exportApi` -> `8000`

This keeps frontend naming and backend route ownership aligned.

## 3. Backend API Entry Modularization

Import backend registration now uses entry modules:

- Entry router composition: `presto/web_api/api_entries/import_api.py`
- Entry registry: `presto/web_api/api_entries/registry.py`
- App registration hook: `presto/web_api/server.py` via `register_api_entries(...)`

Shared route dependency helpers are isolated in:

- `presto/web_api/dependencies.py`

### Why this matters

- New API domains can be added as separate entries without editing unrelated route files.
- Frontend API modules can map cleanly to backend registration units.
- Migration toward a unified backend can be staged incrementally.

## 4. Import Workflow Internals

Import flow is centered around:

- Frontend workflow: `web/src/features/import/ImportWorkflow.tsx`
- Import API routes: `presto/web_api/routes_import.py`
- Orchestration: `presto/app/orchestrator.py`

Key behavior:

- Analyze results are cached per selected source folder in hidden file:
  - `.presto_ai_analyze.json`
- Re-selecting the same folder auto-loads cached proposals when files match.
- Manual proposal edits (name/category) are persisted back to cache with debounce.
- Import run progress is updated item-by-item via task registry.

## 5. Configuration and Persistence

Import/config backend (`presto`) stores local app data via `ConfigStore`:

- Config JSON and logs under app support directory
- In dev, Electron sets default app support to repo-local `.presto/`

Export backend (`track2do_backend`) writes runtime artifacts to repo-local paths:

- `logs/`
- `output/`
- `temp/`

## 6. Process Lifecycle

Electron main is responsible for:

- Spawning both Python services on app startup
- Stopping child processes on app quit
- Providing filesystem, HTTP, window, and shell IPC APIs to renderer

Primary implementation:

- `startPythonApi()` in `web/electron/main.ts` and `main.mjs`

## 7. Error Handling Strategy

- Python APIs return structured error payloads where possible (`error_code`, `message`).
- Electron wraps network errors with retry and timeout handling for transient failures.
- Renderer surfaces actionable messages and operation logs.

## 8. Adding a New API Entry (Recommended Pattern)

1. Create route module(s) in backend domain.
2. Create entry composition router in `presto/web_api/api_entries/<entry>.py`.
3. Register it in `presto/web_api/api_entries/registry.py` as `frontend_entry`.
4. Add/adjust route mapping rule in Electron `BACKEND_ROUTE_RULES`.
5. Add frontend API module under `web/src/services/api` or feature-local API layer.
6. Add tests and update docs.

## 9. Testing Matrix

Minimum checks:

```bash
npm --prefix web run typecheck
pytest -q tests/test_ai_rename_service.py tests/test_config_store.py
```

Import orchestration changes:

```bash
pytest -q tests/test_orchestrator_integration.py
```

Electron routing changes:

```bash
node --check web/electron/main.mjs
```

## 10. Known Constraints

- macOS-only automation assumptions
- Pro Tools UI automation depends on English UI labels and Accessibility permissions
- Dual-backend architecture increases routing complexity; keep mapping rules explicit and tested
