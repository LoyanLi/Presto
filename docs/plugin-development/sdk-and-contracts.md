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
- 页面、导航、命令、设置页定义
- workflow definition
- capability ID 与 capability client 类型

如果你在写插件，先看 `packages/contracts/src/plugins/*`。

## 3. `packages/contracts-manifest` 是跨语言事实源

这里保存 capability、schema 和 DAW target 相关事实源。

它的作用是：

- 作为共享 capability 目录的上游输入
- 驱动 TypeScript / Python / Rust 生成产物
- 让宿主、后端、插件围绕同一套 capability ID 工作

当前最直接的文件包括：

- `capabilities.json`
- `schemas.json`
- `daw-targets.json`

这不是给插件直接 import 运行时代码的地方。

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
- 插件页面组件会收到 `PluginPageProps`

当前 `PluginPageProps` 里包含：

- `context`
- `host`
- `params`
- `searchParams`

其中 `host` 当前稳定开放的能力是：

- `pickFolder()`

这意味着：

- 插件页面可以请求宿主打开目录选择器
- 但这不等于插件拿到了通用 `runtime` 或 `dialog` client

## 8. 什么时候需要改哪一层

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
