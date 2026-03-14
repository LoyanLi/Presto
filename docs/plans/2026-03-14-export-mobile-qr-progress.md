# Export Mobile QR Progress Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a mobile read-only progress page for export tasks via per-run QR link in LAN, with manual link invalidation.

**Architecture:** Introduce a lightweight mobile progress HTTP service in Electron main process, create per-run signed session links from the export page, and serve read-only progress JSON mapped from existing export task state.

**Tech Stack:** Electron main/preload (TypeScript/ESM), React + TypeScript, existing export API polling state, npm typecheck.

---

### Task 1: Define mobile progress session model and manager (Electron main)

**Files:**
- Modify: `frontend/electron/main.ts`
- Modify: `frontend/electron/main.mjs`
- Test/Check: `frontend/scripts/check_mobile_progress_session.ts`

**Step 1: Write failing check script**

```ts
// check create/close/validate lifecycle
```

**Step 2: Run check to verify it fails**

Run: `npx --prefix frontend tsx frontend/scripts/check_mobile_progress_session.ts`
Expected: FAIL (session helpers missing).

**Step 3: Write minimal implementation**

Add session manager in main process:
- `createMobileProgressSession(taskId: string): { sessionId, token }`
- `getMobileProgressSession(sessionId: string): Session | null`
- `closeMobileProgressSession(sessionId: string): boolean`
- `validateMobileProgressSession(sessionId: string, token: string): Session | null`

Rules:
- secure random token
- in-memory only
- `active` flag controls validity

**Step 4: Run check to verify it passes**

Run: `npx --prefix frontend tsx frontend/scripts/check_mobile_progress_session.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/electron/main.ts frontend/electron/main.mjs frontend/scripts/check_mobile_progress_session.ts
git commit -m "feat(runtime): add mobile progress session manager"
```

### Task 2: Add mobile HTTP server and read-only routes

**Files:**
- Modify: `frontend/electron/main.ts`
- Modify: `frontend/electron/main.mjs`

**Step 1: Write failing runtime assertion check**

- Add temporary startup assertion: route handlers required but missing.

**Step 2: Run app check to verify it fails**

Run: `npm --prefix frontend run dev`
Expected: mobile route unavailable.

**Step 3: Write minimal implementation**

In Electron main process:
- start `http.createServer(...)` for mobile viewer.
- add routes:
  - `GET /mobile/view/:sessionId/:token` (HTML page)
  - `GET /mobile/api/export-progress/:sessionId/:token` (JSON)
- use session validation guard for both routes.
- return 404 on invalid token/session.
- JSON fields whitelist only:
  - `status, progress, current_snapshot, total_snapshots, current_snapshot_name, updated_at`

**Step 4: Manual verify route responses**

Run app and verify from browser:
- valid link returns HTML/JSON
- invalid token returns 404

**Step 5: Commit**

```bash
git add frontend/electron/main.ts frontend/electron/main.mjs
git commit -m "feat(runtime): add mobile read-only progress routes"
```

### Task 3: Expose IPC bridge methods for mobile QR session

**Files:**
- Modify: `frontend/electron/preload.ts`
- Modify: `frontend/electron/preload.cjs`
- Modify: `frontend/src/types/electron.d.ts`
- Modify: `frontend/electron/main.ts`
- Modify: `frontend/electron/main.mjs`

**Step 1: Write failing type usage in UI**

- reference `window.electronAPI.exportMobile.createSession(...)` in UI before types exist.

**Step 2: Run typecheck to verify failure**

Run: `npm --prefix frontend run typecheck`
Expected: FAIL (missing ipc/type definitions).

**Step 3: Write minimal implementation**

Add IPC handlers:
- `export-mobile:create-session(taskId)`
- `export-mobile:close-session(sessionId)`
- `export-mobile:get-view-url(sessionId)`

Expose in preload and `electron.d.ts`.

**Step 4: Run typecheck to verify pass**

Run: `npm --prefix frontend run typecheck`
Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/electron/preload.ts frontend/electron/preload.cjs frontend/src/types/electron.d.ts frontend/electron/main.ts frontend/electron/main.mjs
git commit -m "feat(bridge): expose export mobile session ipc"
```

### Task 4: Build Export UI controls (generate QR / copy link / close)

**Files:**
- Modify: `frontend/src/features/export/track2do/components/ExportPanel.tsx`
- Modify: `frontend/src/i18n/index.tsx`
- Add dep (if needed): `frontend/package.json`

**Step 1: Write failing UI compile (new state fields + handlers)**

- add UI references first (`mobileSession`, `handleGenerateQr` etc.).

**Step 2: Run typecheck to verify failure**

Run: `npm --prefix frontend run typecheck`
Expected: FAIL before wiring.

**Step 3: Write minimal implementation**

In `ExportPanel`:
- add section:
  - `Generate QR`
  - `Copy Link`
  - `Close Link`
- render QR image from generated URL (use library or data URL generator).
- show explicit read-only + same Wi‑Fi hints.
- keep existing export flow unchanged.

In i18n add zh/en keys for mobile section.

**Step 4: Run typecheck to verify pass**

Run: `npm --prefix frontend run typecheck`
Expected: PASS.

**Step 5: Commit**

```bash
git add frontend/src/features/export/track2do/components/ExportPanel.tsx frontend/src/i18n/index.tsx frontend/package.json frontend/package-lock.json
git commit -m "feat(export-ui): add mobile qr read-only progress section"
```

### Task 5: Build mobile HTML view and polling behavior

**Files:**
- Modify: `frontend/electron/main.ts`
- Modify: `frontend/electron/main.mjs`

**Step 1: Write failing manual behavior check**

- open mobile view URL; page exists but no polling.

**Step 2: Verify failure manually**

Run app; page does not update.

**Step 3: Write minimal implementation**

In served HTML:
- poll `/mobile/api/export-progress/:sessionId/:token` every 1000ms.
- render status/progress/current snapshot.
- show terminal states clearly.
- handle 404 as “link expired/closed”.

**Step 4: Manual verify pass**

- start export, scan QR, see live updates.
- close link in desktop, mobile page transitions to expired state.

**Step 5: Commit**

```bash
git add frontend/electron/main.ts frontend/electron/main.mjs
git commit -m "feat(runtime): add mobile viewer polling page"
```

### Task 6: Verification and rollout docs

**Files:**
- Create: `docs/plans/2026-03-14-export-mobile-qr-progress-execution.md`
- Modify: `docs/plans/2026-03-14-export-mobile-qr-progress-design.md`

**Step 1: Run static checks**

Run:
- `npm --prefix frontend run typecheck`

Expected: PASS.

**Step 2: Manual smoke test matrix**

- start export -> generate QR -> mobile sees progress
- export completed -> mobile still readable
- click close link -> mobile invalidated
- invalid token URL -> 404

**Step 3: Document results**

Record:
- selected mobile port
- tested devices/browsers
- known limitations

**Step 4: Commit docs**

```bash
git add docs/plans/2026-03-14-export-mobile-qr-progress-design.md docs/plans/2026-03-14-export-mobile-qr-progress-execution.md
git commit -m "docs(export): record mobile qr progress rollout"
```
