# Logging Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the append-forever `current.log` behavior with one readable session log file per app launch and ensure all runtime error paths write concise, complete diagnostics.

**Architecture:** Keep the logging implementation local to the existing runtime boundary. Update `frontend/runtime/appLogStore.mjs` to own session file creation and compact formatting, then tighten the sidecar and backend supervisor producers so they emit operation-specific summaries and always record failures. Keep Tauri error propagation simple by preserving real sidecar error messages instead of rewrapping them.

**Tech Stack:** Node.js runtime modules, Electron-side tests with Node test runner, Tauri Rust bridge, existing packaging scripts.

---

### Task 1: Lock session-file logging behavior with failing tests

**Files:**
- Modify: `frontend/electron/test/app-log-store.test.mjs`
- Modify: `frontend/runtime/appLogStore.mjs`

**Step 1: Write the failing test**

Add test coverage in `frontend/electron/test/app-log-store.test.mjs` that expects:
- `createAppLogStore()` to create a timestamped session log file instead of `current.log`
- the written log entry to use a concise summary line
- compact details to appear only when they add new information

**Step 2: Run test to verify it fails**

Run: `node --test frontend/electron/test/app-log-store.test.mjs`
Expected: FAIL because the store still writes `current.log` and pretty-prints details.

**Step 3: Write minimal implementation**

Update `frontend/runtime/appLogStore.mjs` to:
- generate one session log filename on store creation
- append entries to that file
- format one summary line plus one compact JSON line only when needed

**Step 4: Run test to verify it passes**

Run: `node --test frontend/electron/test/app-log-store.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/electron/test/app-log-store.test.mjs frontend/runtime/appLogStore.mjs
git commit -m "refactor(logging): write session-scoped app logs"
```

### Task 2: Lock sidecar error summaries with failing tests

**Files:**
- Modify: `frontend/electron/test/sidecar-capability-routing.test.mjs`
- Modify: `frontend/sidecar/main.ts`

**Step 1: Write the failing test**

Add or extend a sidecar-focused test that expects:
- RPC failures to log the actual operation and real error cause in the summary line
- bootstrap failures to log a direct summary instead of `sidecar_boot_failed` plus detached detail noise

**Step 2: Run test to verify it fails**

Run: `node --test frontend/electron/test/sidecar-capability-routing.test.mjs`
Expected: FAIL because the sidecar still emits generic wrapper messages.

**Step 3: Write minimal implementation**

Update `frontend/sidecar/main.ts` so that:
- `appendAppLog()` callers provide operation-specific summaries
- redundant detail fields are removed
- all request failure branches continue to return the same RPC error payloads while producing cleaner logs

**Step 4: Run test to verify it passes**

Run: `node --test frontend/electron/test/sidecar-capability-routing.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/electron/test/sidecar-capability-routing.test.mjs frontend/sidecar/main.ts
git commit -m "fix(logging): summarize sidecar failures clearly"
```

### Task 3: Lock backend supervisor failure logging with failing tests

**Files:**
- Modify: `frontend/electron/test/backend-supervisor.test.mjs`
- Modify: `frontend/runtime/backendSupervisor.ts`

**Step 1: Write the failing tests**

Add tests in `frontend/electron/test/backend-supervisor.test.mjs` that expect:
- backend stderr output to emit an error log entry
- recoverable request failures to emit a warning before restart
- start or readiness failures to be recorded with the true failure reason

**Step 2: Run tests to verify they fail**

Run: `node --test frontend/electron/test/backend-supervisor.test.mjs`
Expected: FAIL because not every failure branch is currently logged in a consistent structured way.

**Step 3: Write minimal implementation**

Update `frontend/runtime/backendSupervisor.ts` to:
- log start and readiness failures before throwing
- keep stderr, restart, list, and invoke failure summaries consistent
- preserve `lastError` while also writing the failure entry to the active session log

**Step 4: Run tests to verify they pass**

Run: `node --test frontend/electron/test/backend-supervisor.test.mjs`
Expected: PASS

**Step 5: Commit**

```bash
git add frontend/electron/test/backend-supervisor.test.mjs frontend/runtime/backendSupervisor.ts
git commit -m "fix(logging): capture backend supervisor failures"
```

### Task 4: Verify Tauri error propagation and packaging

**Files:**
- Modify only if needed: `src-tauri/src/main.rs`
- Modify: `README.md`
- Modify: `docs/architecture.md`

**Step 1: Write the failing check**

Inspect the Tauri bridge and verify whether any branch still collapses real sidecar failures into a generic fallback that would prevent clear logging or settings-page display.

**Step 2: Run targeted verification**

Run:
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `node --test frontend/electron/test/app-log-store.test.mjs frontend/electron/test/backend-supervisor.test.mjs frontend/electron/test/sidecar-capability-routing.test.mjs`

Expected: Any remaining generic fallback or regression is exposed by tests.

**Step 3: Write minimal implementation**

If needed, update `src-tauri/src/main.rs` so sidecar errors keep the real message. Update `README.md` and `docs/architecture.md` to describe:
- session-scoped log files
- concise log summary format
- where runtime and backend failures are recorded

**Step 4: Run full verification and packaging**

Run:
- `node --test frontend/electron/test/app-log-store.test.mjs frontend/electron/test/backend-supervisor.test.mjs frontend/electron/test/sidecar-capability-routing.test.mjs`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- project packaging command used for app build

Expected: PASS

**Step 5: Commit**

```bash
git add README.md docs/architecture.md src-tauri/src/main.rs frontend/electron/test/app-log-store.test.mjs frontend/electron/test/backend-supervisor.test.mjs frontend/electron/test/sidecar-capability-routing.test.mjs frontend/runtime/appLogStore.mjs frontend/runtime/backendSupervisor.ts frontend/sidecar/main.ts
git commit -m "refactor(logging): standardize runtime diagnostics"
```
