# Task Plan: Electron + Dual Python Services Stability

## Goal
Eliminate startup race conditions and improve runtime resilience for the two backend services (import/export), including better port handling, auto-recovery, and unified diagnostics.

## Scope
- Electron main process service orchestration
- Frontend API readiness and retry behavior
- Port allocation/conflict handling for 8000/8001
- Crash detection and auto-restart for Python services
- Unified log collection surface and export

## Phases
| Phase | Description | Status |
|---|---|---|
| 1 | Baseline analysis: current startup flow, health checks, port usage, logs | complete |
| 2 | Design + implement readiness gating and request retry UX | complete |
| 3 | Design + implement port conflict strategy and configurable ports | complete |
| 4 | Design + implement process watchdog, heartbeat, auto-restart | complete |
| 5 | Design + implement unified log stream + one-click export | complete |
| 6 | Verification: tests, manual checks, failure scenario validation | complete |

## Success Criteria
1. App waits for services to become ready before first API call, with user-visible status.
2. Port conflict no longer causes silent failure/crash; fallback or actionable error is provided.
3. Crashed service is automatically restarted with bounded retries and clear UI signal.
4. Logs from frontend/electron/import/export are visible in one place and exportable.

## Key Decisions
1. Adopt **single-port, single-active-backend** architecture (default `8000`) instead of dual concurrent Python services.
2. Backend mode (`import` / `export`) is switched explicitly by frontend view changes; inactive backend process is stopped.
3. Keep resilience features (readiness gating, retry, auto-restart, unified logs) on top of this single-active model.

## Errors Encountered
| Error | Attempt | Resolution |
|---|---|---|
| None yet | - | - |
