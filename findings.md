# Findings

## 2026-03-13 Initial Notes
- User-reported reliability issues center around Electron orchestration of two Python services.
- Highest-risk areas to inspect first:
  1. Service startup sequencing vs. frontend request timing
  2. Fixed-port assumptions (8000/8001) and conflict behavior
  3. Runtime health monitoring and restart strategy
  4. Log fragmentation and diagnostics UX

## Open Questions
- Is there already an IPC channel for backend status and logs in Electron preload/main?
- Are frontend API base URLs static or configurable at runtime?
- Is there any existing health endpoint contract for both services?
- Where should unified logs be persisted and what retention policy is expected?

## 2026-03-13 Baseline Code Findings (Electron main)
- File inspected: `frontend/electron/main.ts`
- Existing strengths:
  - HTTP IPC proxy already has transient retry (`HTTP_MAX_ATTEMPTS`, timeout, exponential-ish delay by attempt factor).
  - Backend route splitting exists (`/api/v1/import/*` -> 8001, export/session routes -> 8000).
- Confirmed gaps vs. requested fixes:
  1. **Startup readiness race**:
     - `app.whenReady()` immediately does `startPythonApi()` then creates window.
     - No wait-for-health check before renderer starts issuing API calls.
  2. **Port conflict handling**:
     - Ports are fixed from env/default (`8000/8001`).
     - No port availability probe, no dynamic fallback, no conflict UX.
  3. **Process self-healing**:
     - On child exit only logs + null assignment.
     - No restart policy, no heartbeat monitor, no crash state exposure beyond basic `backend:get-status`.
  4. **Unified logging**:
     - Logs are only forwarded to Node stdout/stderr with prefixes.
     - No in-memory ring buffer, IPC log subscription, or export endpoint for users.

## 2026-03-13 Baseline Code Findings (Preload + Frontend)
- `frontend/electron/preload.ts` currently exposes:
  - `backend.getStatus()` and `backend.restart()`
  - HTTP proxy methods
  - Filesystem helpers
- Missing in preload API:
  - No backend lifecycle event subscription (`starting/ready/error/restarting`)
  - No log stream subscription
  - No runtime port update operations
- Frontend API clients currently pin base URL to `http://127.0.0.1:8000` when not using Electron bridge.
- `backend.getStatus()` appears unused in frontend views; there is no always-visible backend readiness banner.
- Existing UI has no dedicated diagnostics/log panel (only per-feature local logs in import workflow state).

## 2026-03-13 Runtime File Mapping
- Electron runtime currently uses:
  - Main process: `frontend/electron/main.mjs`
  - Preload bridge: `frontend/electron/preload.cjs`
- TypeScript counterparts (`main.ts`, `preload.ts`) exist, but runtime-critical behavior must be implemented in `.mjs/.cjs` for immediate effect.

## 2026-03-13 New Constraint From User
- Import/Export services are not expected to run simultaneously.
- Requested architecture change:
  - Merge to same port
  - Use only one active backend at a time
- Implementation direction updated to: **single-port + mode switch** rather than dual-service concurrency.

## 2026-03-13 Implemented Solution Summary
- Runtime backend supervisor (`frontend/electron/main.mjs`) now uses:
  - **Single shared port** (`PT_API_PORT`, default `8000`)
  - **Single active backend mode** (`import` or `export`)
  - Route-based mode inference + explicit mode activation IPC
  - Startup readiness wait, request-time readiness gating, and fetch retry
  - Port occupancy probing with automatic fallback and warning records
  - Heartbeat monitor + bounded auto-restart window
  - Unified in-memory runtime logs + export-to-file IPC
- Preload bridge extended (`frontend/electron/preload.cjs`, `frontend/electron/preload.ts`) with:
  - `backend.activateMode`
  - `backend.updatePorts`
  - `backend.getLogs`
  - `backend.exportLogs`
- Home UI (`frontend/src/App.tsx`) now includes:
  - Backend diagnostics panel (mode/status/pid/port/restart count)
  - Shared-port config control
  - Restart action
  - Unified log viewer and one-click log export

## 2026-03-13 Follow-up: Renderer Log Unification
- Added renderer-side log ingestion into unified runtime log stream:
  - Captures `webContents` `console-message` and stores in main-process log ring buffer.
  - Captures renderer lifecycle anomalies (`render-process-gone`, `unresponsive`, `responsive`) as warnings/errors.
- Result: frontend logs now appear in the same diagnostics panel and exported log bundle.
