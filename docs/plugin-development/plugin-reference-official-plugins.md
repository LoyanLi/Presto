# 官方插件标准参考

本文档把当前官方插件整理成标准参考矩阵。目的不是复述源码，而是说明写新插件时应该向哪个样例对齐。

## 1. 总表

| 插件 | 类型 | 页面 | Settings | Workflow Definition | 适合作为参考 |
| --- | --- | --- | --- | --- | --- |
| `official.import-workflow` | `workflow` | 有 | 有 | 有 | 复杂 workflow、批量处理、settings、纯逻辑分层 |
| `official.export-workflow` | `workflow` | 有 | 有 | 有 | 轻量 workflow、快照管理、导出 job 流程 |
| `official.split-stereo-to-mono-automation` | `automation` | 无 | 无 | 无 | 最小 automation、单 capability 自动化入口 |

## 2. `official.import-workflow`

路径：

- `plugins/official/import-workflow/manifest.json`
- `plugins/official/import-workflow/dist/entry.mjs`
- `plugins/official/import-workflow/dist/ImportWorkflowPage.mjs`
- `plugins/official/import-workflow/dist/workflowCore.mjs`
- `plugins/official/import-workflow/dist/workflow-definition.json`

这个插件展示了当前最完整的 workflow 标准：

- 页面
- `styleEntry`
- 多 section settings
- workflow core 纯逻辑模块
- 多步骤 workflow definition
- 批量 rename / color / strip / save 编排
- 导入运行参数与 workflow 编排解耦：`ui.importAudioMode` 进入 `daw.import.run.start`，`ui.fadeAfterStrip` / `ui.fadePresetName` 进入 plan item

它也是当前 import 类 workflow 的正式参考实现，已经覆盖这几类稳定设置：

- 导入音频模式：`copy` / `link`
- `Strip Silence` 后批量 fade
- 空 `fadePresetName` 透传为“省略 `fade_preset_name`”，语义是复用 `Pro Tools` Fades 对话框的 last-used 设置，而不是查找一个空名 preset

新插件如果需要复杂列表、批量处理、配置驱动执行，应先参考它。

## 3. `official.export-workflow`

路径：

- `plugins/official/export-workflow/manifest.json`
- `plugins/official/export-workflow/dist/entry.mjs`
- `plugins/official/export-workflow/dist/ExportWorkflowPage.mjs`
- `plugins/official/export-workflow/dist/workflowCore.mjs`
- `plugins/official/export-workflow/dist/workflow-definition.json`

这个插件展示了较轻的 workflow 标准：

- 页面
- 简单 settings
- 快照和预设相关本地逻辑
- 单主步骤 workflow definition
- job 进度 UI

如果新插件需要页面和 job，但编排没有那么复杂，优先参考它。

## 4. `official.split-stereo-to-mono-automation`

路径：

- `plugins/official/split-stereo-to-mono-automation/manifest.json`
- `plugins/official/split-stereo-to-mono-automation/dist/entry.mjs`

这个插件展示了最小 automation 标准：

- 没有页面
- 没有 settings
- 没有 workflow definition
- 只有 automation item、能力声明和最小入口模块
- 当前宿主只会按 `automationType: "splitStereoToMono"` 把它接到自动化卡片表面

如果新插件只是向宿主注册一个单一自动化入口，应先参考它。

## 5. 标准映射建议

### 想写复杂 workflow

先看：

1. `official.import-workflow`
2. `official.export-workflow`

### 想写轻量 workflow

先看：

1. `official.export-workflow`
2. `official.import-workflow`

### 想写最小 automation

先看：

1. `official.split-stereo-to-mono-automation`

## 6. 不应该参考什么

以下内容不要当成插件正式标准：

- 宿主私有 runtime
- 历史文档中的 `context.runtime`
- 未在官方插件中出现的 `requiredRuntimeServices`
- 没有被宿主识别的自定义 `automationType`
