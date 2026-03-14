# Findings

## 2026-03-14 Obsidian v0.2 规划抽取

### 主任务
- 笔记：`TaskNotes/Tasks/presto-v0.2-稳定性与交互可用性.md`
- 目标：优先打通 Pro Tools 自动化稳定性与关键可用性问题，确保流程可持续执行。
- 验收条件：
  - 子任务全部完成
  - 回归验证通过
  - 变更文档同步完成

### 6 个子任务（原文要点）
1. `presto-v0.2-subtask-01`：PTSL 与 UI 自动化容错增强（异常捕获、步骤重试、窗口状态判断、容错执行）
2. `presto-v0.2-subtask-02`：Pro Tools 状态检测（工程状态、轨道选择、版本校验、友好提示）
3. `presto-v0.2-subtask-03`：中英文界面兼容增强（多语言兼容、UI 元素智能匹配、降低对文字依赖）
4. `presto-v0.2-subtask-04`：大工程执行性能优化（异步任务、进度回调、分批处理、后台执行）
5. `presto-v0.2-subtask-05`：错误信息友好化（中英文提示、原因说明、解决方案指引）
6. `presto-v0.2-subtask-06`：全局任务进度与状态（任务队列、进度条、状态实时更新）

### 上游清单关联
- 笔记：`开发/Presto/更新需解决的问题清单.md`
- 观察：架构与稳定性部分多项已划线完成；v0.2 当前重点落在“Pro Tools 交互与自动化问题 + UX 问题”中的 6 个子任务。

## 初步执行策略
- 按“稳定性前置、体验后置”的顺序推进：
  1. 先降低失败概率（容错 + 状态检测）
  2. 再提升兼容与吞吐（多语言 + 性能）
  3. 最后统一用户反馈（错误提示 + 全局进度）

## Open Questions
- 子任务 01/02 的验收指标是否需要量化（例如失败率阈值、重试上限）？
- 子任务 04 的性能基线用哪组工程样本衡量？
- 子任务 06 的全局状态展示是仅主界面，还是覆盖导入/导出子流程页？

## 2026-03-14 GitHub Issues 拆分结果（Phase 1-6）
- 已将 v0.2 六个子任务拆为 6 个可跟踪 GitHub issue 草案。
- 输出文件：`docs/V0_2_GITHUB_ISSUES_CHECKLIST.md`
- 每个 issue 已包含：
  - 标题（含 v0.2 / P1）
  - 建议标签
  - 依赖关系
  - 描述
  - 验收标准
  - 验证方法
- 建议创建顺序：01 -> 02 -> 03 -> 04 -> 05 -> 06

## 2026-03-14 Phase 3 实施发现（中英文界面兼容）
- 现状确认：
  - `ProToolsUiAutomation` 原实现默认依赖 `selector_map_en_us.json`，关键 UI 路径对英文文案耦合较强。
- 已实施改造：
  - 新增 `selector_map_bilingual.json`，将关键 selector 外置并提供中英候选值。
  - 默认 selector map 切换为双语文件，避免仅依赖英文映射。
  - Color Palette / Strip Silence 关键动作改为候选匹配与关键词兜底。
- 测试证据：
  - `backend/tests/test_screen_drag_mapping.py` 扩展为 5 个测试：
    - 默认双语 map 生效
    - 双语关键候选字段存在
    - 生成的 AppleScript 含双语候选变量（`menuBarCandidates` / `paletteWindowCandidates` / `windowCandidates`）
  - 相关回归：`11 passed`
- 仍需补足：
  - 真实 Pro Tools 中英文界面的端到端验证（尤其是不同版本 UI 文案差异）。

## 2026-03-14 Phase 3 策略调整（强制英文界面）
- 用户反馈显示双语路径在真实环境下仍存在快捷键 toggle 副作用（窗口被二次触发关闭）。
- 决策：回退为英文 UI 强约束方案，降低行为不确定性。
- 落地结果：
  - 默认 selector map 使用 `selector_map_en_us.json`。
  - 预检阶段强制校验 `Window` 菜单存在，不满足则提示切换英文 UI。
  - Strip Silence 打开动作保持“单次触发不重试”。

## 2026-03-14 Phase 3 方向变更（Presto App UI 本地化）
- 用户最新决策：Phase 3 不再以 Pro Tools UI 自动化语言兼容为目标，改为 Presto App UI 本地化。
- 新范围定义：
  - 前端 UI 文案资源化（避免组件内硬编码）。
  - 语言包至少覆盖 `zh-CN` 与 `en-US`。
  - 在 Settings 提供语言切换入口并持久化用户偏好。
  - 覆盖 Home / Import / Export / Settings / Developer 的核心可见文案。
- 影响：
  - 先前“Pro Tools 双语 selector”相关内容降级为历史尝试，不作为当前 Phase 3 验收标准。

## 2026-03-14 Phase 3 本地化实现发现（第一版）
- 技术落点：
  - 使用前端轻量 i18n 上下文（非第三方库）实现：
    - locale 状态管理
    - 运行时 `t(key, vars)` 插值
    - `localStorage` 持久化（重启后保留语言）
- 覆盖范围（首批）：
  - Home / Import / Export / Settings / Developer 主页面
  - Settings 弹窗（AI 设置、分类编辑器）
- 当前已满足：
  - 支持 `zh-CN` 与 `en-US` 两套文案
  - Settings 内可切换语言并即时生效
- 仍需补足：
  - Export 子组件（Track2Do 内部）仍有部分硬编码英文文案未统一接入 i18n。
  - 后续应补充 UI 冒烟验证（两种语言各跑一轮主路径）。
