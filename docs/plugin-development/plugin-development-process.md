# 插件开发流程

本文档描述当前插件开发的标准流程。目标不是给一份“建议”，而是给一条和现有宿主、后端、官方插件一致的最短实施路径。

## 1. 第一步：先确定插件类型

先判断你的需求属于哪一类：

- `workflow`
  - 有页面、有输入、有预览、有 settings，通常还需要 `workflowDefinition`
- `automation`
  - 单一动作、宿主自动化卡片入口、能力集很小，当前官方标准不带页面

如果你的需求本质上是多步骤编排、条件执行、批量处理、作业追踪，不要强行做成 `automation` 插件，应直接按 `workflow` 插件设计。

## 2. 第二步：先盘点 capability，不要先写页面

在写任何 UI 之前，先列出插件真正需要调用的 capability。

至少要确认：

- 哪些 capability 是正式存在的
- 哪些 capability 会启动 job
- 哪些 capability 只做同步查询
- 是否已经能覆盖你的完整执行路径

如果缺 capability，先回到平台能力设计，不要用插件绕过宿主边界。

## 3. 第三步：设计 manifest

manifest 是插件接入的第一入口，不是实现完成后补写的说明文件。

设计 manifest 时，先定清楚：

- `pluginId`
- `extensionType`
- `displayName`
- `entry`
- `requiredCapabilities`
- `pages` 或 `automationItems`
- 是否需要 `settingsPages`
- 是否需要 `workflowDefinition`

当前开发顺序应该是：

1. 先把 manifest 设计完整
2. 再写入口模块和页面
3. 最后再做样式和细节补充

## 4. 第四步：划清 UI 和内核边界

这一步最容易做错。

当前推荐分工如下：

- 页面组件
  - 负责输入、预览、局部状态、错误展示、用户交互
- `workflowCore` 或等价纯逻辑模块
  - 负责默认值、归一化、校验、payload 组装、纯函数规则
- `workflow-definition.json`
  - 负责正式 capability 编排
- capability / jobs
  - 负责真正执行

不要把执行路径硬塞进页面组件。

## 5. 第五步：实现入口模块

入口模块至少完成这些内容：

- 导出 `manifest`
- 导出 `activate(context)`
- 按 manifest 导出页面组件
- 如果有 settings，导出 `loadExport` / `saveExport`

官方 workflow 插件入口参考：

- `plugins/official/import-workflow/dist/entry.mjs`
- `plugins/official/export-workflow/dist/entry.mjs`

官方 automation 插件入口参考：

- `plugins/official/split-stereo-to-mono-automation/dist/entry.mjs`

## 6. 第六步：补齐专项内容

### 6.1 `workflow` 插件

通常要补齐：

- 页面组件
- `styleEntry`
- `settingsPages`
- `workflowDefinition`
- workflow core 纯逻辑模块

### 6.2 `automation` 插件

当前官方最小标准通常只需要：

- `automationItems`
- 能力声明
- 最小入口模块

如果你发现自己需要页面、复杂状态、批量流程或 workflow definition，应该重新评估它是不是其实属于 `workflow` 插件。

## 7. 第七步：对照官方插件做结构自检

对照以下样例：

- `official.import-workflow`
  - 复杂 workflow 参考
- `official.export-workflow`
  - 轻量 workflow 参考
- `official.split-stereo-to-mono-automation`
  - 最小 automation 参考

至少检查：

- 目录结构是否同类一致
- manifest 字段是否同类一致
- 导出是否完整
- capability 声明是否覆盖实际调用

## 8. 第八步：补测试

当前官方插件测试主要覆盖这些方面：

- `manifest.json` 与模块导出的对齐
- 入口模块导出完整性
- 页面或 UI 的基本渲染行为
- 关键交互和 host 能力使用

标准最少应有：

- manifest / entry 对齐测试
- 核心导出测试

如果有页面或 workflow core，建议继续加：

- 页面交互测试
- workflow core 纯函数测试

## 9. 第九步：交付前自检

- `requiredCapabilities` 和实际调用一致
- 没有使用 `context.runtime`
- 没有声明 `requiredRuntimeServices`
- 没有绕过 `context.presto.*`
- `workflow` 插件的 `workflowDefinition` 可被宿主校验通过
- `automation` 插件的 `automationItems` 完整且唯一

## 10. 一句话判断标准

如果一个插件实现完成后，你还能明确说出“哪部分是 UI、哪部分是纯逻辑、哪部分是正式 capability 编排、哪部分是宿主负责挂载”，那它大概率符合当前架构。
