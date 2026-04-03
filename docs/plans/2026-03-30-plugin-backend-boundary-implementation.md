# Plugin Backend Boundary Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将插件边界收敛为纯声明层，删除插件 runtime 执行面，并把所有执行逻辑迁回后端 capability / job。

**Architecture:** 先删除插件 runtime 协议与装配，再把前端主进程和插件中的执行逻辑下沉到 backend handler，最后重写官方插件与文档。整个改造不保留兼容层，系统只保留单一路径：插件声明，后端执行。

**Tech Stack:** TypeScript, React, Electron, Python FastAPI, pytest, node:test

---

### Task 1: Remove Plugin Runtime Contract

**Files:**
- Modify: `packages/contracts/src/plugins/context.ts`
- Delete: `packages/contracts/src/plugins/runtime.ts`
- Modify: `packages/contracts/src/plugins/index.ts`
- Modify: `packages/contracts/src/index.ts`
- Delete: `packages/contracts-manifest/runtime-services.json`
- Delete: `packages/contracts-manifest/plugin-permissions.json`

**Step 1: Write the failing tests**

Add assertions in the existing plugin contract surface tests so they fail if:

- `PluginContext` still contains `runtime`
- runtime service names are still exported
- plugin permission artifacts still reference runtime services

**Step 2: Run tests to verify they fail**

Run: `npm test -- --runInBand` if a unified test script exists, otherwise run the specific `node:test` suites that cover plugin contract surfaces.

Expected: failures referencing `runtime`, `PluginRuntime`, or runtime service permissions.

**Step 3: Write the minimal implementation**

- Remove `runtime` from `PluginContext`
- Remove runtime-related exports from contracts barrel files
- Delete runtime service manifest artifacts

**Step 4: Run tests to verify they pass**

Run the same test commands.

Expected: plugin contract surface tests pass.

**Step 5: Commit**

```bash
git add packages/contracts packages/contracts-manifest
git commit -m "refactor: remove plugin runtime contract"
```

### Task 2: Remove Runtime Permission Guard and Host Injection

**Files:**
- Delete: `host-plugin-runtime/src/permissions/guardRuntimeAccess.ts`
- Modify: `host-plugin-runtime/src/permissions/createPluginRuntime.ts`
- Modify: `frontend/host/pluginHostRuntime.ts`
- Modify: `host-plugin-runtime/src/index.ts`
- Test: `host-plugin-runtime/test/guardRuntimeAccess-surface.test.mjs`
- Test: `frontend/electron/test/plugin-mac-accessibility-guard.test.mjs`

**Step 1: Write the failing tests**

Replace runtime guard tests with boundary tests that assert:

- plugin context no longer exposes `runtime`
- host plugin loader does not pass runtime into `createPluginRuntime`
- runtime guard module is no longer part of the public host-plugin-runtime surface

**Step 2: Run tests to verify they fail**

Run the targeted `node --test` commands for host-plugin-runtime and frontend plugin host tests.

Expected: failures referencing removed runtime assumptions.

**Step 3: Write the minimal implementation**

- Remove runtime dependency from `createPluginRuntime`
- Remove runtime argument from plugin host loading flow
- Delete runtime guard export and implementation

**Step 4: Run tests to verify they pass**

Run the same targeted test commands.

Expected: host plugin loading tests pass without runtime injection.

**Step 5: Commit**

```bash
git add host-plugin-runtime frontend/host frontend/electron
git commit -m "refactor: stop injecting runtime into plugins"
```

### Task 3: Remove Runtime Permissions From Plugin Discovery and Validation

**Files:**
- Modify: `host-plugin-runtime/src/validation/validatePermissions.ts`
- Modify: `host-plugin-runtime/src/discovery/discoverPlugins.ts`
- Modify: `host-plugin-runtime/src/discovery/generated/runtimeServices.ts`
- Test: `host-plugin-runtime/test/discoverPlugins-validation.test.mjs`

**Step 1: Write the failing tests**

Add or rewrite tests to assert:

- plugin manifests are validated only against capability requirements
- `requiredRuntimeServices` is rejected as unsupported schema
- discovery no longer depends on runtime service generated lists

**Step 2: Run tests to verify they fail**

Run: `node --test host-plugin-runtime/test/discoverPlugins-validation.test.mjs`

Expected: failures referencing old permission validation behavior.

**Step 3: Write the minimal implementation**

- Remove runtime service validation
- Remove generated runtime service registry usage
- Treat plugin manifests containing runtime service declarations as invalid

**Step 4: Run tests to verify they pass**

Run the same test.

Expected: discovery and validation tests pass under the new schema.

**Step 5: Commit**

```bash
git add host-plugin-runtime
git commit -m "refactor: remove plugin runtime permission validation"
```

### Task 4: Move Automation Definition Execution Into Backend

**Files:**
- Delete: `frontend/electron/runtime/automationRuntime.mjs`
- Modify: `frontend/electron/main.mjs`
- Modify: `frontend/electron/runtime/registerRuntimeHandlers.mjs`
- Modify: `backend/presto/application/handlers/automation.py`
- Modify: `backend/presto/application/handlers/invoker.py`
- Test: `frontend/electron/test/automation-runtime.test.mjs`
- Test: `backend/presto/tests/test_capabilities_invoke.py`

**Step 1: Write the failing tests**

Add backend tests asserting:

- automation definition discovery and execution are served by backend capability handlers
- no plugin-facing or frontend automation runtime remains responsible for execution

Replace Electron-side automation runtime tests with assertions that the old runtime module and IPC route no longer exist.

**Step 2: Run tests to verify they fail**

Run targeted backend pytest cases and frontend `node:test` cases.

Expected: failures because execution is still wired through Electron.

**Step 3: Write the minimal implementation**

- Port definition loading and execution from Electron runtime into backend automation handler
- Remove Electron runtime bridge and handler wiring for plugin automation execution

**Step 4: Run tests to verify they pass**

Run the same targeted backend and frontend tests.

Expected: backend capability tests pass; Electron tests confirm removal of the old path.

**Step 5: Commit**

```bash
git add backend/presto frontend/electron
git commit -m "refactor: move automation execution to backend"
```

### Task 5: Move Import Plugin Side Effects Into Backend

**Files:**
- Modify: `backend/presto/application/handlers/import_workflow.py`
- Modify: `plugins/official/import-workflow/manifest.json`
- Modify: `plugins/official/import-workflow/dist/ImportWorkflowPage.mjs`
- Test: `backend/presto/tests/test_import_workflow.py`
- Test: `plugins/official/import-workflow/test/pluginModule.test.mjs`

**Step 1: Write the failing tests**

Add backend tests for:

- folder discovery
- audio file enumeration
- analyze cache read/write
- import payload preparation

Add plugin tests asserting the plugin no longer references `context.runtime`.

**Step 2: Run tests to verify they fail**

Run targeted pytest and plugin `node:test` suites.

Expected: failures because folder scan and cache behavior still live in the plugin.

**Step 3: Write the minimal implementation**

- Add backend capabilities or extend existing import capabilities to own directory scanning and cache persistence
- Remove runtime service declarations from the import plugin manifest
- Rewrite the plugin page so it only submits inputs and renders returned data

**Step 4: Run tests to verify they pass**

Run the same pytest and plugin tests.

Expected: import flow passes with no plugin runtime usage.

**Step 5: Commit**

```bash
git add backend/presto plugins/official/import-workflow
git commit -m "refactor: move import workflow side effects to backend"
```

### Task 6: Move Export Plugin Side Effects Into Backend

**Files:**
- Modify: `backend/presto/application/handlers/import_workflow.py`
- Modify: `plugins/official/export-workflow/manifest.json`
- Modify: `plugins/official/export-workflow/dist/ExportWorkflowPage.mjs`
- Test: `backend/presto/tests/test_import_workflow.py`
- Test: `plugins/official/export-workflow/test/pluginModule.test.mjs`

**Step 1: Write the failing tests**

Add backend tests for:

- snapshot and preset persistence
- mobile progress session lifecycle
- output-folder side effects

Add plugin tests asserting the export plugin no longer references `context.runtime`.

**Step 2: Run tests to verify they fail**

Run targeted pytest and plugin `node:test` suites.

Expected: failures because export side effects still live in the plugin.

**Step 3: Write the minimal implementation**

- Move snapshot persistence, mobile progress, and folder-open behavior behind backend capabilities or job metadata
- Remove runtime service declarations from the export plugin manifest
- Rewrite the export page to operate entirely via `context.presto.*` and `jobs.*`

**Step 4: Run tests to verify they pass**

Run the same targeted pytest and plugin tests.

Expected: export flow passes with backend-owned side effects.

**Step 5: Commit**

```bash
git add backend/presto plugins/official/export-workflow
git commit -m "refactor: move export workflow side effects to backend"
```

### Task 7: Rewrite Docs To Match the New Boundary

**Files:**
- Modify: `README.md`
- Modify: `docs/frontend-architecture.md`
- Modify: `docs/communication-architecture.md`
- Modify: `docs/sdk-development.md`
- Modify: `docs/third-party-plugin-development.md`

**Step 1: Write the failing tests**

Add or update doc-contract tests so they fail if docs still claim:

- plugins receive runtime services
- plugins can access shell/fs/macAccessibility/mobileProgress
- Electron is a plugin execution layer

**Step 2: Run tests to verify they fail**

Run the relevant doc/source assertion tests under `frontend/electron/test` and any related suites.

Expected: failures matching stale documentation claims.

**Step 3: Write the minimal implementation**

Rewrite docs so they state one boundary only:

- plugin defines
- backend executes
- host bridges

**Step 4: Run tests to verify they pass**

Run the same doc/source tests.

Expected: doc assertions pass.

**Step 5: Commit**

```bash
git add README.md docs frontend/electron/test
git commit -m "docs: align plugin architecture with backend execution boundary"
```

### Task 8: End-to-End Boundary Verification

**Files:**
- Test: `host-plugin-runtime/test/*`
- Test: `frontend/electron/test/*`
- Test: `backend/presto/tests/*`
- Test: `plugins/official/*/test/*`

**Step 1: Run boundary-focused test suites**

Run:

```bash
node --test host-plugin-runtime/test/*.test.mjs
node --test frontend/electron/test/*.test.mjs
node --test plugins/official/import-workflow/test/*.test.mjs
node --test plugins/official/export-workflow/test/*.test.mjs
node --test plugins/official/split-stereo-to-mono-automation/test/*.test.mjs
pytest backend/presto/tests -q
```

Expected: all suites pass.

**Step 2: Perform source grep verification**

Run:

```bash
rg -n "context\\.runtime|requiredRuntimeServices|PluginRuntime|runtime-services" packages frontend host-plugin-runtime plugins docs
```

Expected: no live production references remain; only deleted-path mentions or archived plan docs may appear.

**Step 3: Commit final verification**

```bash
git add -A
git commit -m "test: verify plugin boundary is backend-only"
```
