# Phase 4 Large-Session Performance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve import runtime throughput by ~40% for 100-200 track sessions without parallelizing Pro Tools UI actions.

**Architecture:** Keep PT commands serial, but refactor import execution into staged pipeline (`import+rename`, `color batch`, `strip`) and reduce gateway round-trips. Extend run-state progress with stage-level metadata for visibility and diagnostics.

**Tech Stack:** Python (FastAPI + domain/orchestrator), React + TypeScript, pytest, tsc.

---

### Task 1: Add gateway batch-color and round-trip minimization primitives

**Files:**
- Modify: `backend/import/presto/infra/ptsl_gateway.py`
- Test: `backend/tests/test_ptsl_gateway.py`

**Step 1: Write the failing tests**

```python
def test_apply_track_color_batch_groups_track_names(self) -> None:
    ...

def test_apply_track_color_batch_fallbacks_to_single_track(self) -> None:
    ...
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest -q tests/test_ptsl_gateway.py`
Expected: FAIL with missing batch color API behavior.

**Step 3: Write minimal implementation**

- Add `apply_track_color_batch(slot: int, track_names: list[str]) -> None`.
- Add graceful fallback path for per-track color when grouped call fails.
- Keep existing `apply_track_color()` behavior unchanged for callers not yet migrated.

**Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest -q tests/test_ptsl_gateway.py`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/import/presto/infra/ptsl_gateway.py backend/tests/test_ptsl_gateway.py
git commit -m "feat(runtime): add batch track color gateway path"
```

### Task 2: Refactor orchestrator into staged execution with stage progress callback

**Files:**
- Modify: `backend/import/presto/app/orchestrator.py`
- Modify: `backend/tests/test_orchestrator_integration.py`

**Step 1: Write failing tests**

- Add test for stage order: import/rename before color batch before strip.
- Add test for stage progress callback payload monotonic increase.

**Step 2: Run tests to verify they fail**

Run: `cd backend && python3 -m pytest -q tests/test_orchestrator_integration.py`
Expected: FAIL because stage callback/staged execution is not implemented.

**Step 3: Write minimal implementation**

- Add internal staged execution helpers.
- Add optional callback signature:
  - `stage_name`
  - `stage_current`
  - `stage_total`
  - `overall_current`
  - `overall_total`
  - `current_name`
- Keep legacy `progress_callback(current, total, current_name)` compatibility.

**Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest -q tests/test_orchestrator_integration.py`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/import/presto/app/orchestrator.py backend/tests/test_orchestrator_integration.py
git commit -m "feat(runtime): stage import pipeline for throughput"
```

### Task 3: Extend import task state model with stage metadata

**Files:**
- Modify: `backend/import/presto/web_api/task_registry.py`
- Modify: `backend/import/presto/web_api/routes_import.py`
- Test: `backend/tests/test_config_store.py` (sanity) and new route-level tests if added

**Step 1: Write failing tests**

- Add test asserting run status payload contains `stage`, `stage_current`, `stage_total`, `stage_progress`.

**Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest -q tests/test_orchestrator_integration.py`
Expected: FAIL on missing stage fields in route/task state.

**Step 3: Write minimal implementation**

- Extend `TaskRecord` fields for stage metadata.
- Update `import/run/start` worker update callback to persist stage progress.
- Return new fields in `/import/run/{run_id}` payload.

**Step 4: Run tests to verify it passes**

Run: `cd backend && python3 -m pytest -q tests/test_orchestrator_integration.py tests/test_pt_runtime_guards.py`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/import/presto/web_api/task_registry.py backend/import/presto/web_api/routes_import.py backend/tests
git commit -m "feat(api): expose staged import progress state"
```

### Task 4: Update frontend import state typing and staged progress UI

**Files:**
- Modify: `frontend/src/types/import.ts`
- Modify: `frontend/src/features/import/ImportWorkflow.tsx`

**Step 1: Write failing type-level checks**

- Extend `ImportRunState` type with new stage fields and use them in UI rendering.

**Step 2: Run typecheck to verify it fails**

Run: `npm --prefix frontend run typecheck`
Expected: FAIL until UI and types are aligned.

**Step 3: Write minimal implementation**

- Render stage label + stage progress in run panel.
- Keep existing overall progress bar intact.
- Avoid frequent recompute by using existing memo/state structure.

**Step 4: Run typecheck to verify it passes**

Run: `npm --prefix frontend run typecheck`
Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/types/import.ts frontend/src/features/import/ImportWorkflow.tsx
git commit -m "feat(ui): render staged import progress details"
```

### Task 5: Add benchmark script and performance gate

**Files:**
- Create: `backend/scripts/benchmark_import_phase4.py`
- Create: `backend/tests/test_import_benchmark_smoke.py`
- Modify: `docs/TECHNICAL_ARCHITECTURE.md` (benchmark section reference)

**Step 1: Write failing smoke test**

- Add benchmark smoke test validating script output schema contains:
  - `scenario`
  - `total_seconds`
  - `stage_breakdown`
  - `success_count`
  - `failed_count`

**Step 2: Run test to verify it fails**

Run: `cd backend && python3 -m pytest -q tests/test_import_benchmark_smoke.py`
Expected: FAIL (script missing).

**Step 3: Write minimal implementation**

- Implement script with fixed scenarios (`100`, `150`, `200` tracks).
- Output JSON report for before/after comparison.

**Step 4: Run tests to verify they pass**

Run: `cd backend && python3 -m pytest -q tests/test_import_benchmark_smoke.py`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/scripts/benchmark_import_phase4.py backend/tests/test_import_benchmark_smoke.py docs/TECHNICAL_ARCHITECTURE.md
git commit -m "chore(perf): add phase4 import benchmark harness"
```

### Task 6: Full verification and acceptance

**Files:**
- Modify: `progress.md`
- Modify: `findings.md`
- Modify: `task_plan.md`

**Step 1: Run backend test subset**

Run: `cd backend && python3 -m pytest -q tests/test_ptsl_gateway.py tests/test_orchestrator_integration.py tests/test_pt_runtime_guards.py tests/test_ui_automation_retry.py`
Expected: PASS.

**Step 2: Run frontend typecheck**

Run: `npm --prefix frontend run typecheck`
Expected: PASS.

**Step 3: Run benchmark scenarios**

Run: `cd backend && python3 scripts/benchmark_import_phase4.py --tracks 100 --tracks 150 --tracks 200 --json`
Expected: report generated with measurable runtime reduction target.

**Step 4: Validate acceptance gate**

- Confirm `P50` total runtime improvement `>=40%` for 100-200 range.
- Confirm failure count does not increase.

**Step 5: Commit docs/results**

```bash
git add progress.md findings.md task_plan.md
git commit -m "docs(phase4): record benchmark evidence and acceptance"
```
