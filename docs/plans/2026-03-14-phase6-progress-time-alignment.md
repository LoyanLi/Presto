# Phase 6 Progress-Time Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve existing Import/Export progress accuracy so displayed percentage and ETA better match real runtime, without adding new pages or new global features.

**Architecture:** Keep current API and UI structure, add small reusable progress/ETA math helpers, compute weighted Import overall progress, add finer-grained Export progress updates, and render stable ETA in existing progress panels.

**Tech Stack:** Python (FastAPI), React + TypeScript, pytest, tsc.

---

### Task 1: Add import progress/ETA math helpers

**Files:**
- Create: `backend/import/presto/web_api/progress_metrics.py`
- Test: `backend/tests/test_import_progress_metrics.py`

**Step 1: Write the failing tests**

```python
from presto.web_api.progress_metrics import compute_import_overall_progress, estimate_eta_seconds


def test_compute_import_overall_progress_weighted() -> None:
    progress = compute_import_overall_progress("stage_strip_silence", 50.0)
    assert 80.0 <= progress <= 90.0


def test_estimate_eta_seconds_returns_none_on_low_progress() -> None:
    assert estimate_eta_seconds(elapsed_seconds=10.0, progress=2.0) is None
```

**Step 2: Run test to verify it fails**

Run: `python3 -m pytest -q backend/tests/test_import_progress_metrics.py`
Expected: FAIL (module/function missing).

**Step 3: Write minimal implementation**

```python
# backend/import/presto/web_api/progress_metrics.py
IMPORT_STAGE_WEIGHTS = {
    "stage_import_rename": 0.55,
    "stage_color_batch": 0.10,
    "stage_strip_silence": 0.35,
}


def compute_import_overall_progress(stage: str, stage_progress: float) -> float:
    ...


def estimate_eta_seconds(elapsed_seconds: float, progress: float) -> int | None:
    ...
```

**Step 4: Run test to verify it passes**

Run: `python3 -m pytest -q backend/tests/test_import_progress_metrics.py`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/import/presto/web_api/progress_metrics.py backend/tests/test_import_progress_metrics.py
git commit -m "feat(import-runtime): add progress eta metrics"
```

### Task 2: Integrate import weighted progress + eta into run status

**Files:**
- Modify: `backend/import/presto/web_api/task_registry.py`
- Modify: `backend/import/presto/web_api/routes_import.py`
- Modify: `frontend/src/types/import.ts`
- Test: `backend/tests/test_import_routes_status.py`

**Step 1: Write the failing test update**

```python
def test_import_run_status_includes_eta_seconds(self) -> None:
    registry = TaskRegistry()
    registry.create(TaskRecord(..., eta_seconds=42))
    payload = import_run_status("import_1", self._make_request(registry))
    self.assertEqual(payload["data"]["eta_seconds"], 42)
```

**Step 2: Run test to verify it fails**

Run: `python3 -m pytest -q backend/tests/test_import_routes_status.py`
Expected: FAIL (`eta_seconds` missing).

**Step 3: Write minimal implementation**

- Add `eta_seconds: int | None = None` to `TaskRecord`.
- In `routes_import.py`:
  - remove direct overwrite of `progress` from `_update_progress` (keep counters there).
  - compute weighted overall progress in `_update_stage_progress` via `compute_import_overall_progress(...)`.
  - compute ETA from `started_at` + computed overall progress.
  - include `eta_seconds` in `/import/run/{run_id}` response.
- In frontend type `ImportRunState`, add `eta_seconds?: number | null`.

**Step 4: Run tests to verify they pass**

Run: `python3 -m pytest -q backend/tests/test_import_routes_status.py backend/tests/test_orchestrator_integration.py`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/import/presto/web_api/task_registry.py backend/import/presto/web_api/routes_import.py backend/tests/test_import_routes_status.py frontend/src/types/import.ts
git commit -m "feat(import-api): expose weighted progress and eta"
```

### Task 3: Add export progress/ETA math helpers

**Files:**
- Create: `backend/export/api/progress_metrics.py`
- Test: `backend/tests/test_export_progress_metrics.py`

**Step 1: Write the failing tests**

```python
from api.progress_metrics import compute_export_snapshot_progress, estimate_eta_seconds


def test_compute_export_snapshot_progress_mid_step() -> None:
    value = compute_export_snapshot_progress(snapshot_index=1, total_snapshots=4, step_progress=50.0)
    assert 35.0 <= value <= 40.0


def test_estimate_eta_seconds_returns_value() -> None:
    assert estimate_eta_seconds(elapsed_seconds=30.0, progress=50.0) == 30
```

**Step 2: Run test to verify it fails**

Run: `python3 -m pytest -q backend/tests/test_export_progress_metrics.py`
Expected: FAIL (module/function missing).

**Step 3: Write minimal implementation**

```python
# backend/export/api/progress_metrics.py

def compute_export_snapshot_progress(snapshot_index: int, total_snapshots: int, step_progress: float) -> float:
    ...


def estimate_eta_seconds(elapsed_seconds: float, progress: float) -> int | None:
    ...
```

**Step 4: Run test to verify it passes**

Run: `python3 -m pytest -q backend/tests/test_export_progress_metrics.py`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/export/api/progress_metrics.py backend/tests/test_export_progress_metrics.py
git commit -m "feat(export-runtime): add progress eta metrics"
```

### Task 4: Integrate export fine-grained progress updates + eta

**Files:**
- Modify: `backend/export/api/routes.py`
- Test: `backend/tests/test_export_routes_status_eta.py`

**Step 1: Write the failing tests**

```python
# Async test for get_export_status payload
# Seed export_tasks[task_id] with eta_seconds and progress fields
# Assert response.data includes eta_seconds and monotonic progress value
```

**Step 2: Run test to verify it fails**

Run: `python3 -m pytest -q backend/tests/test_export_routes_status_eta.py`
Expected: FAIL (`eta_seconds` missing).

**Step 3: Write minimal implementation**

- In `execute_export_task(...)`, replace once-per-snapshot progress update with sub-step updates:
  - apply snapshot (e.g. 20%)
  - stabilize wait (e.g. 30%)
  - export bounce (e.g. 85%)
  - move/rename/complete (100% of snapshot)
- Compute total progress via helper and enforce monotonic increase.
- Compute/store `eta_seconds` during running state.
- Include `eta_seconds` in `/export/status/{task_id}` response data.

**Step 4: Run tests to verify they pass**

Run: `python3 -m pytest -q backend/tests/test_export_routes_status_eta.py`
Expected: PASS.

**Step 5: Commit**

```bash
git add backend/export/api/routes.py backend/tests/test_export_routes_status_eta.py
git commit -m "feat(export-api): expose fine-grained progress eta"
```

### Task 5: Add shared frontend ETA format helpers

**Files:**
- Create: `frontend/src/utils/progressEta.ts`
- Create: `frontend/scripts/check_progress_eta.ts`

**Step 1: Write the failing check script**

```ts
import { formatEtaLabel, smoothProgress } from '../src/utils/progressEta'

if (formatEtaLabel(null) !== '--') throw new Error('expected placeholder')
if (smoothProgress(40, 30) !== 40) throw new Error('progress must be monotonic')
```

**Step 2: Run check to verify it fails**

Run: `npx --prefix frontend tsx frontend/scripts/check_progress_eta.ts`
Expected: FAIL (module missing).

**Step 3: Write minimal implementation**

```ts
export function smoothProgress(prev: number, next: number): number { ... }
export function estimateEtaFromProgress(startedAt: string | null | undefined, progress: number): number | null { ... }
export function formatEtaLabel(seconds: number | null): string { ... }
```

**Step 4: Run checks to verify they pass**

Run: `npx --prefix frontend tsx frontend/scripts/check_progress_eta.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/utils/progressEta.ts frontend/scripts/check_progress_eta.ts
git commit -m "feat(ui): add progress eta helpers"
```

### Task 6: Wire Import/Export UI to existing progress + eta fields

**Files:**
- Modify: `frontend/src/features/import/ImportWorkflow.tsx`
- Modify: `frontend/src/features/export/track2do/types/index.ts`
- Modify: `frontend/src/features/export/track2do/components/ExportPanel.tsx`
- Modify: `frontend/src/i18n/index.tsx`

**Step 1: Write failing compile checks first**

- Add ETA usage in Import/Export components before type updates.
- Add new i18n keys usage.

**Step 2: Run check to verify it fails**

Run: `npm --prefix frontend run typecheck`
Expected: FAIL (missing fields/functions/keys wiring).

**Step 3: Write minimal implementation**

- Import page:
  - display `eta_seconds` if provided; else compute fallback from start/progress.
  - show `计算中 / Calculating` before stable estimate.
- Export page:
  - add local display progress smoothing (monotonic) before rendering width.
  - display ETA line in existing progress card.
  - consume backend `eta_seconds` when available.
- i18n:
  - add `import.step3.eta`, `import.step3.etaCalculating`
  - add `export.progress.eta`, `export.progress.etaCalculating`

**Step 4: Run checks to verify they pass**

Run: `npm --prefix frontend run typecheck`
Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/features/import/ImportWorkflow.tsx frontend/src/features/export/track2do/types/index.ts frontend/src/features/export/track2do/components/ExportPanel.tsx frontend/src/i18n/index.tsx
git commit -m "feat(ui): align progress and eta display"
```

### Task 7: Full verification and execution notes

**Files:**
- Modify: `docs/plans/2026-03-14-phase6-global-task-status-design.md`
- Create: `docs/plans/2026-03-14-phase6-progress-time-alignment-execution.md`

**Step 1: Run full targeted backend tests**

Run:
`python3 -m pytest -q backend/tests/test_import_progress_metrics.py backend/tests/test_import_routes_status.py backend/tests/test_orchestrator_integration.py backend/tests/test_export_progress_metrics.py backend/tests/test_export_routes_status_eta.py`

Expected: PASS.

**Step 2: Run frontend checks**

Run:
- `npx --prefix frontend tsx frontend/scripts/check_progress_eta.ts`
- `npm --prefix frontend run typecheck`

Expected: PASS.

**Step 3: Manual smoke test**

Run: `npm --prefix frontend run dev`

Manual verify:
- Import run: progress reflects stage cost; ETA stabilizes after early phase.
- Export run: progress increments within each snapshot; ETA updates smoothly.

**Step 4: Document final results**

- Update design doc with final chosen weights and rationale.
- Write execution log with before/after observations and any tuned constants.

**Step 5: Commit**

```bash
git add docs/plans/2026-03-14-phase6-global-task-status-design.md docs/plans/2026-03-14-phase6-progress-time-alignment-execution.md
git commit -m "docs(phase6): record progress eta optimization rollout"
```
