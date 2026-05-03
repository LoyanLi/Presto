# Contracts 与通信边界

Presto 的核心不是“通信通了”，而是跨宿主、后端、插件边界之后，协议仍然保持统一和可裁剪。

## 1. 三段通信模型

当前主路径通信分三段：

1. Renderer -> Tauri command
2. Tauri Rust runtime -> FastAPI HTTP
3. Plugin -> Host 注入上下文

### 1.1 Renderer -> Tauri

关键文件：

- `frontend/tauri/runtimeBridge.ts`
- `frontend/desktop/runtimeBridge.ts`
- `src-tauri/src/main.rs`

特点：

- Renderer 不自己拼散落的 channel 名
- operation 先在 bridge 中按领域整理
- 宿主统一通过 `runtime_invoke` 进入

### 1.2 Rust runtime -> Backend

关键文件：

- `src-tauri/src/runtime.rs`
- `backend/presto/main_api.py`

特点：

- 使用本地 HTTP JSON
- Rust runtime 负责后端生命周期、健康检查、请求转发
- Renderer 不直连 Python 服务

### 1.3 Plugin -> Host

关键文件：

- `packages/contracts/src/plugins/context.ts`
- `host-plugin-runtime/src/permissions/createPluginRuntime.ts`
- `host-plugin-runtime/src/permissions/guardCapabilityAccess.ts`

特点：

- 插件不是裸 IPC 或裸 HTTP 调用
- 插件拿到的是被宿主裁剪后的 `PluginContext`
- 页面组件还会收到一个受限 `host`

## 2. `packages/contracts` 是正式协议面

`packages/contracts` 当前定义：

- capability request / response envelope
- capability registry 类型
- 插件 manifest
- `PluginContext`
- workflow definition
- 错误与任务模型

它是整个系统的正式类型边界，不是普通工具包。

当前 workspace package 的公开入口以 `package.json#exports` 为准：

- `@presto/contracts` 指向 `packages/contracts/src/index.ts`
- `@presto/sdk-runtime` 指向 `packages/sdk-runtime/src/index.ts`
- `@presto/sdk-runtime/createPrestoRuntime` 指向 `packages/sdk-runtime/src/createPrestoRuntime.ts`

不要再新增与 `exports` 并行的包根转发文件；否则同一个 package 会出现两套入口语义。

## 3. Capability 协议才是核心业务协议

关键定义位于：

- `packages/contracts/src/capabilities/registry.ts`
- `packages/contracts/src/capabilities/ids.ts`
- `packages/contracts/src/capabilities/requests.ts`
- `packages/contracts/src/capabilities/responses.ts`

当前统一 envelope 结构包括：

- `requestId`
- `capability`
- `payload`
- `meta`

返回：

- `success = true` + `data`
- `success = false` + `error`

这意味着真正跨边界稳定的不是某个 IPC 名，也不是某个 HTTP path，而是 capability ID 和它的 schema。

Capability metadata 也是协议的一部分。后端 HTTP schema 使用 snake_case，例如：

- `workflow_scope`
- `canonical_source`
- `field_support`
- `supported_daws`

Rust runtime 暴露给 `sdk-runtime` 时会映射成 camelCase，例如：

- `workflowScope`
- `canonicalSource`
- `fieldSupport`
- `supportedDaws`

这层映射必须保留完整 metadata，包括 `portability` 和 `implementations`。Host、Developer Console 和插件可用性判断不能依赖被截断的 capability list。

## 4. `sdk-core` 和 `sdk-runtime` 的职责区别

### 4.1 `sdk-core`

`packages/sdk-core/src/createPrestoClient.ts` 会把 transport 封装成 `PrestoClient`。

它服务的是 capability 调用，例如：

- `presto.daw.connection.getStatus()`
- `presto.track.rename(...)`
- `presto.workflow.run.start(...)`

失败时抛异常，而不是要求调用方手动判断 `success`。

### 4.2 `sdk-runtime`

`packages/sdk-runtime/src/createPrestoRuntime.ts` 组织的是宿主 runtime client，例如：

- `app`
- `backend`
- `dialog`
- `shell`
- `fs`
- `plugins`
- `window`
- `mobileProgress`
- `macAccessibility`

这层服务于宿主和 Renderer 宿主装配，不是插件正式 capability SDK。

## 5. PluginContext 与页面 host 的边界

当前插件 `activate(context)` 只会收到：

- `pluginId`
- `locale`
- `presto`
- `storage`
- `logger`

它没有：

- `runtime`
- `shell`
- `fs`
- `dialog`

但插件页面组件还会收到一个受限 `host`。当前稳定开放的页面宿主能力是：

- `host.pickFolder()`

所以文档必须区分两件事：

1. 插件运行时上下文没有通用 runtime
2. 插件页面宿主仍然可以拿到少量结构化 UI 宿主能力

## 6. 权限是怎么落地的

插件权限不是约定，而是代码里实际守卫。

### 6.1 声明层

manifest 中通过 `requiredCapabilities` 声明依赖。

### 6.2 运行时层

`guardCapabilityAccess(...)` 会把 `PrestoClient` 包装成受 manifest 裁剪的 client。

如果插件调用未声明 capability，会抛出 `PLUGIN_PERMISSION_DENIED`。

### 6.3 校验层

manifest 校验、DAW 支持校验、workflow definition 校验都发生在插件发现和加载阶段。

## 7. 通信边界上的开发规则

- 业务能力优先定义成 capability，而不是直接新增一个宿主私有调用。
- 插件需要的新执行能力，先走 `contracts + capability` 设计，再谈宿主接入。
- 页面级交互辅助能力必须单独定义在页面 host 面，不要混入 `PluginContext`。
- 文档里不能把宿主内部 runtime 操作写成插件正式公开能力。
