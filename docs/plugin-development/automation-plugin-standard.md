# Automation 插件规范

本文档只讲 `automation` 插件标准，当前基准参考是：

- `plugins/official/split-stereo-to-mono-automation`
- `plugins/official/batch-ara-backup-automation`

## 1. 适用范围

以下场景适合做成当前标准下的 `automation` 插件：

- 单一动作
- 触发入口明确
- 不需要插件自带工作区页面
- 不需要 settings page
- 执行链很短，通常直接映射到单个 capability

如果你的插件已经需要页面、复杂输入、多步骤编排或 job 追踪，通常应改做 `workflow` 插件。

## 2. 当前最小标准

当前官方 automation 插件最小结构：

```text
my-automation-plugin/
├── manifest.json
└── dist/
    └── entry.mjs
```

当前官方最小形态没有：

- 页面
- settings
- `workflowDefinition`
- 自定义插件 UI 卡片

## 3. Manifest 标准

automation 插件至少需要：

- `extensionType: "automation"`
- `automationItems`
- `requiredCapabilities`

当前宿主校验要求：

- `automationItems` 必须存在且非空
- `itemId` 不能重复
- `automationType` 必须是字符串
- `runnerExport` 必须是字符串，并且入口模块必须导出同名 runner

## 4. `automationItems` 标准

每个 automation item 当前描述的是宿主自动化入口，而不是插件页面。

关键字段：

- `itemId`
- `title`
- `automationType`
- `description`
- `order`

这里最重要的现实边界是：

- `automationType` 是宿主识别自动化入口的路由标识
- 它不是 capability ID

当前宿主自动化界面实际只处理：

- `automationType: "splitStereoToMono"`
- `automationType: "batchAraBackupRender"`

因此，不应随意发明新的 `automationType`，除非宿主已经明确支持它。

## 5. 入口模块标准

当前 automation 插件入口模块最低要求：

- 导出 `manifest`
- 导出 `activate(context)`
- 导出每个 `automationItems[].runnerExport` 指向的 runner
- 可选导出 `deactivate()`

官方最小实现里，`activate(context)` 只做：

- 记录 `pluginId`
- 记日志

## 6. 当前 UI 边界

当前官方 automation 插件并不自己渲染自动化卡片 UI。

当前模式是：

1. 插件通过 `automationItems` 声明入口
2. 宿主把它转成 `HostAutomationEntry`
3. 宿主自动化页面按 `automationType` 渲染对应卡片
4. 卡片最终调用正式 capability

这意味着当前标准下的 automation 插件更接近“声明宿主可渲染的自动化入口”，而不是“自带独立页面和 UI”。

## 7. 执行模型标准

当前官方 automation 插件的内核是：

- 一个 automation item
- 一个 capability
- 一个非常轻的入口模块

典型模式：

- `automationItems[*].automationType = "splitStereoToMono"`
- `automationItems[*].runnerExport = "runSplitStereoToMono"`
- `requiredCapabilities = ["daw.automation.splitStereoToMono.execute"]`

不要在 automation 插件里自行搭建本地自动化运行时。

带 options 的 runner 最小形态：

```ts
export async function runSplitStereoToMono(context, input) {
  const keepChannel = input.keepChannel === 'right' ? 'right' : 'left'
  await context.presto.daw.automation.splitStereoToMono.execute({ keepChannel })
  return {
    summary: `Kept ${keepChannel} channel`
  }
}
```

automation runner context 在 `PluginContext` 基础上还包含 `macAccessibility`，但它仍然只应服务宿主已定义的 automation 执行路径，不应被当成通用系统自动化出口。

## 8. 当前标准参考

`official.split-stereo-to-mono-automation` 适合作为：

- 最小 automation manifest 参考
- automation item 结构参考
- 单 capability 自动化入口参考
- 不带页面和 settings 的标准参考

`official.batch-ara-backup-automation` 适合作为：

- 多 capability 但仍然短链路的 automation 参考
- boolean options schema 参考
- selection -> duplicate/rename/hide/inactive 这类宿主自动化卡片参考

## 9. 什么时候不该继续用 automation 插件

出现以下任一情况时，应重新评估是否应该改做 workflow 插件：

- 需要多个步骤顺序执行
- 需要条件分支或批量迭代
- 需要页面输入和预览
- 需要 settings 持久化
- 需要 jobs 追踪和进度展示

## 10. 自检清单

- `automationItems` 非空
- `automationType` 是当前宿主已识别的类型
- `runnerExport` 有实际入口模块导出
- `requiredCapabilities` 覆盖实际调用
- 没有补入页面、settings 或 workflow definition 却仍试图做复杂流程
