# Phase 4 Strip Reliability Rollback (2026-03-14)

## Context
During Phase 4 performance work, import processing was split into staged/batched execution.
After that refactor, users reported intermittent `Strip Silence` misses even when status looked successful.

## Root Cause
1. Execution ordering diverged from the stable v0.2 behavior:
   - Old stable path (per track): `rename/select -> color -> select_all -> strip`
   - New staged path: many tracks were imported/renamed first, then strip happened later.
2. Strip UI automation path also diverged:
   - `strip_silence()` was routed through the new hardened retry/context wrapper
   - This introduced extra precheck/focus transitions not present in the stable path

These two changes increased focus/selection drift risk in Pro Tools UI automation.

## Implemented Fix
1. Keep performance work for batched import detection/retry and diagnostics, but restore strip execution order to stable semantics:
   - process each imported track immediately through color + strip before moving to the next track
2. Restore legacy retry semantics for strip action:
   - `strip_silence()` now uses legacy retry loop without context precheck wrapper
3. Keep existing guardrails that are still required:
   - unknown PT version warning downgrade in preflight (`PT_VERSION_UNKNOWN` does not block)
   - per-file retry and explicit file-level failure reasons for track-count mismatch

## Files Updated
- `backend/import/presto/app/orchestrator.py`
- `backend/import/presto/infra/protools_ui_automation.py`
- `backend/import/presto/infra/ptsl_gateway.py`
- `backend/tests/test_orchestrator_integration.py`
- `backend/tests/test_ptsl_gateway.py`
- `backend/tests/test_ui_automation_retry.py`
- `frontend/src/features/import/ImportWorkflow.tsx`

## Regression Coverage Added/Updated
- verify strip happens before next track rename in run pipeline
- verify strip path stays on legacy retry behavior
- verify category batch import behavior and mismatch fallback per file
- verify unknown PT version preflight handling

## Verification
Run command:

```bash
python3 -m pytest -q \
  backend/tests/test_ui_automation_retry.py \
  backend/tests/test_ptsl_gateway.py \
  backend/tests/test_orchestrator_integration.py \
  backend/tests/test_import_routes_status.py \
  backend/tests/test_pt_runtime_guards.py \
  backend/tests/test_import_benchmark_smoke.py
```

Result: `30 passed`
