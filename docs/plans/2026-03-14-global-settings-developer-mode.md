# Global Settings + Developer Mode Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a musician-friendly global settings center and separate developer page gated by explicit Developer Mode confirmation.

**Architecture:** Persist developer-mode as part of backend `ui_preferences`, expose through existing config API, and route frontend into `home/import/export/settings/developer` views. Reuse existing backend diagnostics logic in a dedicated Developer page and keep Import shortcuts by redirecting to specific Settings sections.

**Tech Stack:** FastAPI + Pydantic (backend), React + TypeScript + Tailwind (frontend), pytest, tsc.

---

### Task 1: Persist `developer_mode_enabled` in backend config

**Files:**
- Modify: `backend/import/presto/domain/models.py`
- Modify: `backend/import/presto/config/defaults.py`
- Modify: `backend/import/presto/config/store.py`
- Modify: `backend/import/presto/web_api/schemas.py`
- Modify: `backend/import/presto/web_api/routes_common.py`
- Test: `backend/tests/test_config_store.py`

**Step 1: Write failing test**
- Add assertions in config store tests for `ui_preferences.developer_mode_enabled == False` on default + migration.

**Step 2: Run test to verify it fails**
- Run: `pytest -q backend/tests/test_config_store.py`
- Expected: FAIL with missing `developer_mode_enabled`.

**Step 3: Write minimal implementation**
- Add `developer_mode_enabled` field to model/default/schema/store/update route.

**Step 4: Run test to verify it passes**
- Run: `pytest -q backend/tests/test_config_store.py`
- Expected: PASS.

### Task 2: Build reusable settings dialogs and global Settings page

**Files:**
- Create: `frontend/src/features/settings/ConfigDialogs.tsx`
- Create: `frontend/src/features/settings/SettingsPage.tsx`
- Modify: `frontend/src/types/import.ts`
- Modify: `frontend/src/features/import/ImportWorkflow.tsx`

**Step 1: Write failing type-level checks**
- Add/require `developer_mode_enabled` in `UiPreferences` TS type.

**Step 2: Run typecheck to verify it fails**
- Run: `npm --prefix frontend run typecheck`
- Expected: FAIL where config shape is incomplete.

**Step 3: Minimal implementation**
- Implement global settings page sections (General, AI, Categories, Developer Mode).
- Add ON confirmation before enabling Developer Mode.
- Reuse dialogs for AI/Categories from both Settings and Import.
- Update Import shortcut buttons to route to Settings sections when callbacks are provided.

**Step 4: Run typecheck**
- Run: `npm --prefix frontend run typecheck`
- Expected: PASS.

### Task 3: Move diagnostics from Home to standalone Developer page

**Files:**
- Create: `frontend/src/features/settings/DeveloperPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/types/electron.d.ts` (if needed)

**Step 1: Write failing typecheck expectation**
- Introduce new views `settings` and `developer`; wire component props.

**Step 2: Run typecheck to fail fast**
- Run: `npm --prefix frontend run typecheck`

**Step 3: Minimal implementation**
- Remove backend diagnostics block from Home.
- Add Home cards: Import / Export / Settings.
- Add Settings page and conditional Developer entry.
- Route guard: if developer mode is OFF, prevent entering Developer page and redirect to Settings.
- Move existing diagnostic controls into `DeveloperPage`.

**Step 4: Run typecheck**
- Run: `npm --prefix frontend run typecheck`

### Task 4: Verification and behavior checks

**Files:**
- Modify: `progress.md` / `findings.md` / `task_plan.md` (if tracking updates needed)

**Step 1: Run backend tests**
- Run: `pytest -q backend/tests`

**Step 2: Run frontend typecheck**
- Run: `npm --prefix frontend run typecheck`

**Step 3: Manual smoke run**
- Run: `npm --prefix frontend run dev`
- Validate UX flow:
  - Home has no developer panel.
  - Settings toggles developer mode with confirm.
  - Developer page visible only when mode ON.
  - Import shortcuts open Settings target sections.

