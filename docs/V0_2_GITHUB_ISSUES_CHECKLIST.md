# Presto v0.2 GitHub Issues Checklist

## Scope
- This checklist maps to v0.2 Phase 1-6 from `task_plan.md`.
- Goal: turn each subtask into one trackable GitHub issue with clear acceptance criteria.

## Milestone / Label Suggestions
- Milestone: `v0.2 Stability & UX`
- Base labels: `v0.2`, `priority:high`, `type:fix`, `area:import`, `area:export`, `area:electron`, `area:backend`, `area:frontend`

## Issue 1
- [ ] **[v0.2][P1] Harden PTSL + UI automation fault tolerance**
- Suggested labels: `v0.2`, `priority:high`, `type:fix`, `area:backend`, `area:electron`
- Depends on: none
- Description:
  - Improve automation stability when popups, focus changes, or window position changes occur.
  - Add robust exception handling and bounded retry strategy for key automation steps.
- Acceptance criteria:
  - Failures from transient UI state changes are retried automatically with bounded attempts.
  - Window/focus pre-check runs before critical automation actions.
  - Errors are classified (`retryable` vs `non-retryable`) and logged with step context.
  - Automated tests cover retry path and non-retryable abort path.
- Verification:
  - Simulate popup/focus/window drift and verify flow can recover or fail fast with actionable reason.

## Issue 2
- [ ] **[v0.2][P1] Add Pro Tools runtime state detection guardrails**
- Suggested labels: `v0.2`, `priority:high`, `type:fix`, `area:backend`
- Depends on: Issue 1
- Description:
  - Validate Pro Tools environment before running actions: session open state, track selection, and version checks.
  - Block execution early when prerequisites are not met.
- Acceptance criteria:
  - Preflight check returns structured status for session/track/version.
  - User gets clear blocking reason before action starts.
  - Minimum supported Pro Tools version is configurable and enforced.
  - Tests cover each blocking scenario.
- Verification:
  - Run flows with missing session, missing selection, and low version; confirm guarded failure behavior.

## Issue 3
- [ ] **[v0.2][P1] Localize Presto App UI (ZH/EN)**
- Suggested labels: `v0.2`, `priority:high`, `type:feature`, `area:frontend`
- Depends on: Issue 1
- Description:
  - 为 Presto 前端界面建立本地化机制（文案资源、切换逻辑、持久化偏好）。
  - 覆盖核心页面：Home / Import / Export / Settings / Developer 的关键用户可见文案。
- Acceptance criteria:
  - UI 文案不再硬编码在组件内，集中由 locale 资源文件管理。
  - 至少支持 `zh-CN` 与 `en-US` 两套文案资源。
  - 用户可在 Settings 切换语言，且重启后保持选择。
  - Import/Export 主流程页面在两种语言下可正常使用且无空文案。
- Verification:
  - 手动切换 UI 语言并完成 Import 与 Export 关键路径冒烟。

## Issue 4
- [ ] **[v0.2][P1] Optimize large-session execution performance**
- Suggested labels: `v0.2`, `priority:high`, `type:fix`, `area:backend`, `area:frontend`
- Depends on: Issue 2
- Description:
  - Improve throughput and responsiveness for large track counts using async tasking and batch processing.
  - Add progress callbacks so UI remains responsive.
- Acceptance criteria:
  - Long-running operations run asynchronously and do not block UI thread.
  - Batch size is configurable with safe defaults.
  - Progress events expose `total/current/percentage/stage`.
  - Benchmark on large sessions shows measurable improvement over baseline.
- Verification:
  - Compare baseline vs optimized runtime on agreed large-session sample.

## Issue 5
- [ ] **[v0.2][P1] Standardize user-friendly error messaging**
- Suggested labels: `v0.2`, `priority:high`, `type:fix`, `area:frontend`, `area:backend`
- Depends on: Issue 1, Issue 2
- Description:
  - Replace raw technical errors with bilingual actionable messages.
  - Add cause and suggested remediation in user-facing error surfaces.
- Acceptance criteria:
  - Error schema includes `code`, `userMessage`, `cause`, `actionHint`, `locale`.
  - Core failure cases show readable CN/EN text.
  - Raw stack traces are hidden by default in UI but preserved in logs.
  - UI and backend tests cover message mapping.
- Verification:
  - Trigger representative failures and confirm user-facing copy is clear and actionable.

## Issue 6
- [ ] **[v0.2][P1] Add global task queue + real-time progress status**
- Suggested labels: `v0.2`, `priority:high`, `type:feature`, `area:frontend`, `area:electron`, `area:backend`
- Depends on: Issue 4
- Description:
  - Provide global task queue and unified progress/status indicators for long-running actions.
  - Ensure users can distinguish running, queued, completed, and failed tasks.
- Acceptance criteria:
  - Global task model supports queueing and state transitions.
  - UI includes always-visible status/progress entry point.
  - Progress stream is consistent across import/export/AI workflows.
  - Status survives transient renderer refresh/reload within same app session.
- Verification:
  - Run concurrent queued actions and confirm deterministic ordering + live status updates.

## Suggested Creation Order
1. Issue 1
2. Issue 2
3. Issue 3
4. Issue 4
5. Issue 5
6. Issue 6

## Optional `gh` CLI Flow
```bash
# Example:
gh issue create \
  --title "[v0.2][P1] Harden PTSL + UI automation fault tolerance" \
  --label "v0.2,priority:high,type:fix,area:backend,area:electron" \
  --body-file docs/V0_2_GITHUB_ISSUES_CHECKLIST.md
```

Note: if you want, we can split this file into six standalone issue body files for one-command creation.
