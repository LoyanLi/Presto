# Logging Redesign Design

**Goal:** Make application logs readable and complete by writing one log file per app launch, recording every error path, and replacing generic multi-line error dumps with concise summaries plus minimal structured context.

## Context

- The current runtime log store always appends to `current.log`.
- Error entries often use a generic message such as `sidecar_request_failed` and place the real reason inside a pretty-printed JSON block.
- That makes the log file grow forever and forces a human to inspect detached JSON to understand the failure.
- The main error paths now cross:
  - `frontend/sidecar/main.ts`
  - `frontend/runtime/backendSupervisor.ts`
  - `src-tauri/src/main.rs`
  - `frontend/runtime/appLogStore.mjs`

## Scope

- Redesign only the local application logging path.
- Keep the existing in-memory log list and export capability.
- Ensure current host, sidecar, backend supervisor, and Tauri bridge failures are all written into the active session log.
- Do not add remote upload, retention policy, compression, or a separate logging service.

## Decisions

### 1. Use one log file per app launch

- `frontend/runtime/appLogStore.mjs` will create a session log file when the store is created.
- The filename will include the launch timestamp, for example `presto-2026-04-06T10-23-11.412Z.log`.
- `getCurrentLogPath()` will return the current session file path.
- `current.log` will be removed as a runtime target.

### 2. Make the first line human-readable by default

- Every entry will write one summary line in the form:
  - `[timestamp] [level] [source] summary`
- The summary will carry the real operation and error cause instead of a generic wrapper.
- Examples:
  - `[2026-04-06T10:23:11.412Z] [error] [sidecar.rpc] backend.capability.invoke unsupported_operation`
  - `[2026-04-06T10:23:12.001Z] [error] [backend.supervisor] invoke_capability PT_VERSION_UNSUPPORTED capability=track.open.set requestId=req-12`

### 3. Only keep structured details when they add information

- The log writer will stop pretty-printing every `details` object by default.
- If an entry still has context that is not already represented in the summary line, it will append one compact JSON line after the summary.
- Redundant keys such as `message` or `operation` that are already in the summary will not be repeated in details.

### 4. Treat error logging as a required boundary concern

- `frontend/sidecar/main.ts` will log:
  - sidecar bootstrap failures
  - per-request RPC failures with operation-specific summaries
- `frontend/runtime/backendSupervisor.ts` will log:
  - backend start failures
  - health check restarts
  - backend stderr output
  - capability list failures
  - capability invoke failures
  - backend process exit
- `src-tauri/src/main.rs` will keep propagating the real sidecar failure message so the sidecar and host can log the true cause instead of a synthetic fallback.

### 5. Keep the implementation local and product-focused

- No new shared logging abstraction layer will be introduced.
- The formatter and file strategy stay inside `frontend/runtime/appLogStore.mjs`.
- Producers are responsible for emitting good summary fields, while the store stays responsible for serialization and file layout.

## Data Flow

1. A runtime component emits `level`, `source`, `message`, and optional `details`.
2. The log store normalizes the entry, computes the session file path, and formats a concise primary line.
3. If `details` still contains non-redundant fields, the store appends one compact JSON line.
4. The entry is kept in memory for UI inspection and written to the session log file for diagnostics.

## Validation Strategy

- Update the app log store test to assert that:
  - a session log file is created
  - logs no longer target `current.log`
  - the file contains concise single-line summaries
  - compact details are only present when needed
- Add or expand sidecar and backend supervisor tests to lock:
  - operation-specific error summaries
  - backend stderr and request failures being logged
  - session log path wiring
- Run the relevant frontend and Tauri tests plus the packaging command used by the project release flow.

## Non-goals

- No compatibility alias back to `current.log`
- No daily log rotation
- No log retention cleanup job
- No remote telemetry or analytics pipeline
