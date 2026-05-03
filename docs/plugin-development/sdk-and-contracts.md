# SDK 与 Contracts

本文档只讲插件开发真正相关的协议层，不讨论宿主内部实现细节。

## 1. 先分清四样东西

插件开发里最容易混淆的是：

1. `packages/contracts`
2. `packages/contracts-manifest`
3. `packages/sdk-core`
4. `packages/sdk-runtime`

## 2. `packages/contracts` 是正式插件协议

它定义了插件真正能依赖的协议面：

- `WorkflowPluginManifest`
- `WorkflowPluginModule`
- `PluginContext`
- workflow/tool 页面、automation/tool 入口、设置页定义
- workflow definition
- capability ID 与 capability client 类型

如果你在写插件，先看 `packages/contracts/src/plugins/*`，或通过公开 package exports 引用：

- `@presto/contracts/plugins`
- `@presto/contracts/plugins/manifest`
- `@presto/contracts/plugins/module`
- `@presto/contracts/plugins/page`
- `@presto/contracts/plugins/settings`
- `@presto/contracts/plugins/context`

## 3. `packages/contracts-manifest` 是跨语言事实源

这里保存 capability、schema、DAW target 和默认 app config 相关事实源。

它的作用是：

- 作为共享 capability 目录的上游输入
- 驱动 TypeScript / Python / Rust 生成产物
- 让宿主、后端、插件围绕同一套 capability ID 工作

当前最直接的文件包括：

- `capabilities.json`
- `schemas.json`
- `daw-targets.json`
- `app-config-defaults.json`

这不是给插件直接 import 运行时代码的地方。
插件也不应该绕过 package exports 去引用 `packages/*/index.ts` 这类包根文件；公开入口以各 workspace package 的 `package.json#exports` 为准。

## 4. `sdk-core` 才是 capability SDK

`packages/sdk-core` 把 capability transport 装配成 `PrestoClient`。

插件正式通过 `context.presto` 使用它。

典型调用形态：

- `context.presto.system.health()`
- `context.presto.daw.connection.getStatus()`
- `context.presto.track.rename(...)`
- `context.presto.workflow.run.start(...)`

能力失败时会抛异常。

## 5. `sdk-runtime` 不是插件正式运行时

`packages/sdk-runtime` 描述的是宿主 runtime client：

- `dialog`
- `shell`
- `fs`
- `window`
- `backend`
- `plugins`
- `mobileProgress`
- `macAccessibility`

这层服务于宿主和 Renderer Host，不是插件 `activate(context)` 可以直接依赖的正式 SDK。

当前与 `macAccessibility` 相关的宿主事实还包括：

- 宿主会在应用启动时先做一次辅助功能权限预检。
- Rust runtime 会在真正执行 Accessibility 调用前再次检查，并在缺权限时弹出系统引导。
- 这属于宿主运行时行为，不等于插件正式拿到了可自由支配的系统自动化权限。

## 6. `PluginContext` 的真实边界

当前定义是：

```ts
export interface PluginContext {
  pluginId: string
  locale: PluginLocaleContext
  presto: PrestoClient
  storage: PluginStorage
  logger: PluginLogger
}
```

因此插件正式可依赖的运行时对象只有：

- `presto`
- `storage`
- `logger`
- `locale`

这里没有 `runtime`。

## 7. 页面组件会额外收到受限 `host`

需要区分模块激活和页面渲染：

- `activate(context)` 只收到 `PluginContext`
- workflow 页面收到 `PluginWorkflowPageProps`
- tool 页面收到 `PluginToolPageProps`

两类页面 props 都包含：

- `context`
- `host`
- `params`
- `searchParams`

其中 `host` 的当前稳定能力分两类：

- workflow 页面：
  - `pickFolder()`
- tool 页面：
  - `dialog.openFile()` / `dialog.openDirectory()`
  - `fs.readFile()/writeFile()/exists()/readdir()/deleteFile()`
  - `shell.openPath()`
  - `runTool({ toolId, input })`

这意味着：

- 页面可以请求宿主执行有限 UI/文件辅助能力
- 但这不等于插件拿到了通用 `runtime` client
- tool 页面实际能调用哪些 host 方法，由 manifest 里的 `toolRuntimePermissions` 决定；未声明的调用会被运行时拒绝
- 如果 manifest 已声明但宿主壳没有提供对应 runtime，调用会以 `PLUGIN_TOOL_HOST_UNAVAILABLE` 失败，不再返回静默占位值

## 8. tool runner 额外上下文

tool runner 使用 `PluginToolRunnerContext`，它在 `PluginContext` 基础上增加：

- `dialog`
- `fs`
- `shell`
- `process.execBundled(...)`

`process.execBundled` 对应的是 manifest 里的 `bundledResources` 与 `toolRuntimePermissions`，不是开放式系统命令执行。
权限缺失与宿主 runtime 缺失会被区分成不同错误码，前者是 `PLUGIN_TOOL_PERMISSION_DENIED`，后者是 `PLUGIN_TOOL_HOST_UNAVAILABLE`。

tool 页面不能直接拿到 `process.execBundled`。它通过 `host.runTool(...)` 触发 runner；runner 才能在 `PluginToolRunnerContext` 里访问 `process.execBundled(...)`。

## 9. 什么时候需要改哪一层

如果需求是新增正式业务能力：

1. 改 `contracts`
2. 改 `contracts-manifest`
3. 生成共享产物
4. 再改后端 / 宿主 / 插件

如果需求是调整正式 DAW target 列表：

1. 改 `packages/contracts-manifest/daw-targets.json`
2. 生成共享产物
3. 再改真正新增 target 的 runtime / adapter 实现

如果需求只是插件页面需要一个受限 UI 宿主辅助能力：

- 先明确它是不是页面 host 能力
- 不要直接把宿主 runtime 塞进 `PluginContext`
