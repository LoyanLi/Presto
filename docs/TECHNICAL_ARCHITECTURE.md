# Technical Architecture

This document explains Presto internals for maintainers and contributors.

## 1. System Overview

Presto runs as a desktop application with three runtime layers:

- Renderer: React UI (`frontend/src`)
- Electron main process: process lifecycle + request routing (`frontend/electron/main.ts`, `main.mjs`)
- Local Python services:
  - Export/session service: `backend/export` (`:8000`)
  - Import/config service: `backend/import` running `presto.main_api` (`:8001`)

## 2. Request Routing Model

Renderer-side clients call `http://127.0.0.1:8000` through Electron IPC (`window.electronAPI.http.*`).
Electron main decides whether a request stays on `8000` or is forwarded to `8001` using route rules.

Routing config is in:

- `frontend/electron/main.ts`
- `frontend/electron/main.mjs`

Rules are grouped by frontend API entry names:

- `import` -> `8001`
- `export` -> `8000`

This keeps frontend naming and backend route ownership aligned.

## 3. Backend API Entry Modularization

Import backend registration now uses entry modules:

- Entry router composition: `backend/import/presto/web_api/api_entries/import_api.py`
- Entry registry: `backend/import/presto/web_api/api_entries/registry.py`
- App registration hook: `backend/import/presto/web_api/server.py` via `register_api_entries(...)`

Shared route dependency helpers are isolated in:

- `backend/import/presto/web_api/dependencies.py`

### Why this matters

- New API domains can be added as separate entries without editing unrelated route files.
- Frontend API modules can map cleanly to backend registration units.
- Migration toward a unified backend can be staged incrementally.

## 4. Import Workflow Internals

Import flow is centered around:

- Frontend workflow: `frontend/src/features/import/ImportWorkflow.tsx`
- Import API routes: `backend/import/presto/web_api/routes_import.py`
- Orchestration: `backend/import/presto/app/orchestrator.py`

Key behavior:

- Analyze results are cached per selected source folder in hidden file:
  - `.presto_ai_analyze.json`
- Re-selecting the same folder auto-loads cached proposals when files match.
- Manual proposal edits (name/category) are persisted back to cache with debounce.
- Import run progress is updated via task registry with both overall and stage-level fields:
  - `progress/current_index/total/current_name`
  - `stage/stage_current/stage_total/stage_progress`

### Phase 4 Benchmark Harness

Import throughput benchmark entrypoint:

- `backend/scripts/benchmark_import_phase4.py`

Quick run:

```bash
cd backend
python3 scripts/benchmark_import_phase4.py --tracks 100 --tracks 150 --tracks 200 --json
```

## 5. Configuration and Persistence

Import/config backend (`presto`) stores local app data via `ConfigStore`:

- Config JSON and logs under app support directory
- In dev, Electron sets default app support to repo-local `.presto/`

Export backend (`export`) writes runtime artifacts to repo-local paths:

- `backend/export/logs/`
- `backend/export/output/`
- `backend/export/temp/`

## 6. Process Lifecycle

Electron main is responsible for:

- Spawning both Python services on app startup
- Stopping child processes on app quit
- Providing filesystem, HTTP, window, and shell IPC APIs to renderer

Primary implementation:

- `startPythonApi()` in `frontend/electron/main.ts` and `main.mjs`

## 7. Error Handling Strategy

- Python APIs return structured error payloads where possible (`error_code`, `message`).
- Electron wraps network errors with retry and timeout handling for transient failures.
- Renderer surfaces actionable messages and operation logs.

## 8. Adding a New API Entry (Recommended Pattern)

1. Create route module(s) in backend domain.
2. Create entry composition router in `backend/import/presto/web_api/api_entries/<entry>.py`.
3. Register it in `backend/import/presto/web_api/api_entries/registry.py` as `frontend_entry`.
4. Add/adjust route mapping rule in Electron `BACKEND_ROUTE_RULES`.
5. Add frontend API module under `frontend/src/services/api` or feature-local API layer.
6. Add tests and update docs.

## 9. Testing Matrix

Minimum checks:

```bash
npm --prefix frontend run typecheck
pytest -q backend/tests/test_ai_rename_service.py backend/tests/test_config_store.py
```

Import orchestration changes:

```bash
pytest -q backend/tests/test_orchestrator_integration.py
```

Electron routing changes:

```bash
node --check frontend/electron/main.mjs
```

## 10. Known Constraints

- macOS-only automation assumptions
- Pro Tools UI automation depends on English UI labels and Accessibility permissions
- Dual-backend architecture increases routing complexity; keep mapping rules explicit and tested
