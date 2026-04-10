# 插件开发规范总览

本文档只描述当前 `0.3.5` 代码已经成立的插件协议，并保留所有插件共享的规则。`workflow`、`automation`、UI、自动化内核的专项要求已经拆到独立页面。

## 1. 当前插件模型

当前系统支持两类插件：

- `workflow`
- `automation`

插件可以声明并接入的对象包括：

- `pages`
- `automationItems`
- `settingsPages`
- `workflowDefinition`

这些对象全部由宿主读取 manifest、校验字段、加载入口模块后统一挂载。

## 2. 第一原则

插件当前不是宿主直通脚本模型。

插件负责定义，不负责直接执行宿主或外部系统操作。

成立的规则只有这些：

1. 插件执行正式业务动作时，必须走 `context.presto.*`
2. 插件权限由 `requiredCapabilities` 决定
3. 插件 `activate(context)` 拿不到宿主通用 runtime
4. 插件页面只能使用宿主显式提供的受限 `host` 能力

以下做法当前都不成立：

- 插件不能直接控制外部 app
- 插件不能直接访问宿主私有 runtime
- 插件不能直接调用宿主私有 runtime、Node 文件系统或系统 shell
- 插件不能使用 `context.runtime`
- 插件不能在 manifest 中声明 `requiredRuntimeServices`

## 3. 最小识别结构

所有插件至少都要有：

```text
my-plugin/
├── manifest.json
└── dist/
    └── entry.mjs
```

在此基础上：

- `workflow` 插件通常还会有 `style.css`、`workflow-definition.json`、页面模块、settings 相关导出
- `automation` 插件当前官方基线可以只有最小 manifest 和 `entry.mjs`

## 4. 共享 manifest 规则

当前 `WorkflowPluginManifest` 共同核心字段包括：

- `pluginId`
- `extensionType`
- `version`
- `hostApiVersion`
- `supportedDaws`
- `uiRuntime`
- `displayName`
- `entry`
- `requiredCapabilities`

常见可选字段：

- `description`
- `styleEntry`
- `pages`
- `automationItems`
- `settingsPages`
- `workflowDefinition`
- `adapterModuleRequirements`
- `capabilityRequirements`

共通约束：

- `extensionType` 只能是 `workflow` 或 `automation`
- `uiRuntime` 当前必须是 `react18`
- `supportedDaws` 当前实际应写 `["pro_tools"]`
- `requiredCapabilities` 必须覆盖插件实际调用到的 capability

## 5. 入口模块共同规范

插件入口模块必须符合：

```ts
export interface WorkflowPluginModule {
  manifest: WorkflowPluginManifest
  activate(context: PluginContext): Promise<void> | void
  deactivate?(): Promise<void> | void
}
```

当前最低要求：

- 导出 `manifest`
- 导出 `activate(context)`
- `manifest.entry` 与实际入口模块路径一致

## 6. `PluginContext` 与页面 `host`

### 6.1 激活阶段

`activate(context)` 只能使用：

- `context.presto`
- `context.storage`
- `context.logger`
- `context.locale`

### 6.2 页面阶段

页面组件会收到：

- `context`
- `host`
- `params`
- `searchParams`

当前稳定开放的页面 host 能力是：

- `host.pickFolder()`

这条边界必须始终保持清楚：页面 host 是页面渲染时的宿主辅助能力，不是插件通用 runtime。

## 7. 权限与守卫

权限不是文档约定，而是在运行时实际守卫：

- manifest 声明：`requiredCapabilities`
- 运行时裁剪：`createPluginRuntime(...)`
- 调用守卫：`guardCapabilityAccess(...)`

未声明 capability 的调用会被拒绝。

## 8. 宿主加载与校验过程

当前宿主加载插件时至少会经过：

1. 目录发现
2. manifest 解析
3. manifest 字段校验
4. workflow definition 校验
5. 入口模块可加载校验

只有通过这些校验后，插件才会进入可挂载状态。

## 9. 读哪一页

- 如果你要按顺序写一个新插件：读 [插件开发流程](plugin-development-process.md)
- 如果你在写页面和 settings：读 [Workflow 插件规范](workflow-plugin-standard.md) 和 [插件 UI 规范](plugin-ui-standard.md)
- 如果你在写自动化卡片类插件：读 [Automation 插件规范](automation-plugin-standard.md)
- 如果你在写 capability 编排或 workflow definition：读 [自动化内核规范](automation-kernel-standard.md)
- 如果你要对齐现有标准样例：读 [官方插件标准参考](plugin-reference-official-plugins.md)

## 10. 官方插件基准

当前最值得对齐的标准参考有三个：

- `official.import-workflow`
- `official.export-workflow`
- `official.split-stereo-to-mono-automation`

写新插件时，应优先对齐这些真实样例，而不是发明仓库里不存在的新边界。
