# Progress Log

## 2026-03-14

### Session Start
- 用户要求：根据 Obsidian 内的 v0.2 修复规划设定计划。
- 使用技能：
  - `planning-with-files`（文件化规划）
  - `obsidian-cli`（读取 Obsidian 任务原文）

### Actions Completed
1. 检查项目现有 planning 文件状态（`task_plan.md` / `findings.md` / `progress.md`）。
2. 通过 Obsidian CLI 定位并读取 v0.2 相关笔记：
   - `TaskNotes/Tasks/presto-v0.2-稳定性与交互可用性.md`
   - `TaskNotes/Tasks/presto-v0.2-subtask-01.md` ~ `presto-v0.2-subtask-06.md`
   - `开发/Presto/更新需解决的问题清单.md`
3. 将计划重构为 v0.2 专用执行计划（6 子任务 + 回归 + 文档同步）。

### Current Focus
- 计划已建立，等待进入 Phase 1（PTSL 与 UI 自动化容错增强）实施。

### Update: v0.2 Issues 清单已生成
- 已按用户选择，将 Phase 1-6 拆分为可追踪 GitHub Issues 清单。
- 新增文件：
  - `docs/V0_2_GITHUB_ISSUES_CHECKLIST.md`
- 清单包含 6 个 issue 的标题、标签建议、依赖关系、验收标准与验证方法。

### Verification
- 已确认规划文件已写入：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`
- 已确认 issue 清单文件已写入：
  - `docs/V0_2_GITHUB_ISSUES_CHECKLIST.md`

### Update: Categories 调整为 Import 独有（2026-03-14）
- 按最新需求收敛设置入口：
  - 全局 `Settings` 不再包含 `Categories` 分区。
  - `Category Editor` 仅在 `Import Workflow` 中可见与可编辑。
- 代码调整：
  - `frontend/src/App.tsx`：移除 `onOpenCategorySettings={() => openSettings('categories')}` 透传。
  - `frontend/src/features/import/ImportWorkflow.tsx`：移除外部 `onOpenCategorySettings` 分支，按钮固定打开本地分类弹窗。
- 兼容性确认：
  - `npm --prefix frontend run typecheck` 通过（`tsc --noEmit`）。

### Update: Phase 3 中英文界面兼容增强（2026-03-14）
- 目标：降低 Pro Tools UI 自动化对英文文案的硬编码依赖，支持中英双语关键控件匹配。
- 已完成实现：
  - 新增双语 selector map：`backend/import/presto/infra/selector_map_bilingual.json`
  - `ProToolsUiAutomation` 默认 selector map 切换为双语文件。
  - 关键动作改造为“候选词 + 关键词兜底”策略：
    - 打开 Color Palette 菜单（中英菜单/菜单项候选）
    - 识别 Color Palette / Strip Silence 窗口（中英窗口名候选）
    - 选择 Track 目标项与 Strip 按钮（中英候选 + 关键词兜底）
- TDD 验证：
  - 先补充失败测试：`backend/tests/test_screen_drag_mapping.py`（5 个用例）
  - 实现后回归通过：
    - `cd backend && pytest -q tests/test_screen_drag_mapping.py` -> 5 passed
    - `cd backend && pytest -q tests/test_config_store.py tests/test_orchestrator_integration.py tests/test_screen_drag_mapping.py` -> 11 passed
- 当前状态：
  - Phase 3 代码层兼容策略已落地；
  - 仍需在真实 Pro Tools 中英界面进行一次端到端人工验证后可标记 complete。

### Update: Phase 3 增量修复（Strip Silence 打开跳两下）
- 用户反馈：中文环境下打开 Strip Silence 页面会出现“跳两下”。
- 修复：`_open_strip_silence_window_once` 改为只触发一次 `Cmd+U`，随后短轮询等待窗口出现，移除二次快捷键触发。
- 回归：
  - `cd backend && pytest -q tests/test_screen_drag_mapping.py::UiAutomationSelectorMapTests::test_open_strip_script_contains_bilingual_candidates` -> 1 passed
  - `cd backend && pytest -q tests/test_config_store.py tests/test_orchestrator_integration.py tests/test_screen_drag_mapping.py` -> 11 passed

### Update: Phase 3 二次修复（仍出现两次快捷键）
- 新发现：`open_strip_silence_window` 仍会因 `_with_retry` 重试而再次触发 `Cmd+U`（在 toggle 行为下会把窗口关掉）。
- 修复：
  - `open_strip_silence_window` 改为单次执行，不走重试。
  - 新增测试 `test_open_strip_window_does_not_retry_to_avoid_toggle_close`，确保失败时也只执行 1 次脚本调用。
- 回归：
  - `cd backend && pytest -q tests/test_screen_drag_mapping.py::UiAutomationSelectorMapTests::test_open_strip_window_does_not_retry_to_avoid_toggle_close` -> 1 passed
  - `cd backend && pytest -q tests/test_config_store.py tests/test_orchestrator_integration.py tests/test_screen_drag_mapping.py` -> 12 passed

### Update: Phase 3 策略回退（强制英文 Pro Tools UI）
- 用户决策：放弃双语兼容方案，改为仅支持英文 Pro Tools 界面。
- 实施：
  - 默认 selector map 回退为 `selector_map_en_us.json`。
  - `preflight_accessibility` 增加英文菜单校验：必须存在 `Window` 菜单。
  - `open_strip_silence_window` 维持单次触发，避免 toggle 重试导致窗口被关。
  - 移除 `selector_map_bilingual.json`。
- 回归：
  - `cd backend && pytest -q tests/test_screen_drag_mapping.py` -> 4 passed
  - `cd backend && pytest -q tests/test_config_store.py tests/test_orchestrator_integration.py tests/test_screen_drag_mapping.py` -> 10 passed

### Update: Phase 3 目标重定义（Presto App UI 本地化）
- 用户最新要求：将 Phase 3 从“Pro Tools UI 语言兼容”切换为“Presto App UI 本地化”。
- 已同步调整：
  - `task_plan.md`：Phase 3 描述改为 UI 本地化方向。
  - `docs/V0_2_GITHUB_ISSUES_CHECKLIST.md`：Issue 3 改为前端本地化任务与验收标准。
  - `findings.md`：新增 Phase 3 方向变更记录。
  - Obsidian Phase 3 文档追加方向调整说明。
- 后续执行基准：
  - 以 UI 文案资源化、语言切换、偏好持久化、核心页面覆盖为 Phase 3 验收标准。

### Update: Phase 3 实施启动（App UI 本地化第一版）
- 已新增前端 i18n 基础层：
  - `frontend/src/i18n/index.tsx`（`I18nProvider`、`useI18n`、`en-US/zh-CN` 文案资源、`localStorage` 持久化）
  - `frontend/src/main.tsx` 接入 `I18nProvider`
- 已接入本地化页面（核心文案）：
  - `frontend/src/App.tsx`（Home）
  - `frontend/src/features/settings/SettingsPage.tsx`（含语言切换）
  - `frontend/src/features/settings/DeveloperPage.tsx`
  - `frontend/src/features/import/ImportWorkflow.tsx`（主流程核心文案）
  - `frontend/src/features/export/Track2DoExportWorkflow.tsx`
  - `frontend/src/features/settings/ConfigDialogs.tsx`（AI 设置与分类编辑弹窗）
- 验证：
  - `npm --prefix frontend run typecheck` -> pass

### Update: Strip Silence 打开逻辑优化（窗口已开不再触发快捷键）
- 调整 `open_strip_silence_window_once`：
  - 先检查 `Strip Silence` 窗口是否已存在。
  - 仅在未打开时才发送 `Cmd+U`。
- 回归：
  - `cd backend && pytest -q tests/test_screen_drag_mapping.py tests/test_orchestrator_integration.py` -> 8 passed
  - `cd backend && pytest -q tests/test_config_store.py tests/test_orchestrator_integration.py tests/test_screen_drag_mapping.py` -> 11 passed
