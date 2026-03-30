# Presto 通信架构

本文档面向内部开发者，描述 Presto 当前已经实现的通信路径、协议分层、消息边界与权限控制。Presto 的通信不是单一协议，而是三段式链路：

1. Renderer 与 Electron Main 的 IPC 通信
2. Main 与 Backend 的本地 HTTP 通信
3. Plugin 与 Host 的受限能力调用与受限 Runtime 调用

整个系统的关键目标不是“通信通了”，而是“跨边界调用仍然保持可验证、可裁剪、可追踪”。

## 1. 总体通信拓扑

当前通信拓扑如下：

```text
React Host / Plugin UI
        │
        │ Electron IPC
        ▼
Electron Main Runtime Handlers
        │
        ├── 本地桌面服务
        │   ├── fs
        │   ├── shell
        │   ├── dialog
        │   ├── window
        │   ├── macAccessibility
        │   └── mobileProgress
        │
        └── Backend Supervisor
                │
                │ HTTP JSON
                ▼
           FastAPI /api/v1
                │
                ▼
      Capability Handler / Job / DAW Adapter
```

插件不直接连后端 HTTP，也不直接连主进程私有对象。插件只通过宿主注入的受限 `PluginContext` 访问系统。

当前 Renderer 侧也不是长期暴露宿主桥，而是先从 `preload.ts` 暴露的 `__PRESTO_BOOTSTRAP__` 里一次性取走 client/runtime/插件管理桥，再在宿主层继续装配。

## 2. 第一段通信：Renderer 到 Main

### 2.1 通信形式

Renderer 到 Main 当前使用 Electron IPC。

关键位置：

- 通道定义：`frontend/electron/runtime/runtimeBridge.ts`
- 处理器注册：`frontend/electron/runtime/registerRuntimeHandlers.mjs`

### 2.2 当前通道领域

当前 IPC 通道按领域分组：

- `app`
- `automation`
- `backend`
- `dialog`
- `shell`
- `fs`
- `window`
- `mobileProgress`
- `macAccessibility`
- `plugins`（handler 侧）

这里最重要的设计点是：Renderer 并不直接使用分散的 `ipcRenderer.invoke("xxx")`，而是通过 `runtimeBridge` 获取类型化 runtime client。

### 2.3 当前典型通道

例如：

- `backend:invoke-capability`
- `backend:get-status`
- `plugins:list`
- `plugins:install-directory`
- `fs:read-file`
- `shell:open-external`
- `window:set-always-on-top`

这说明 Main 层承担了一个“系统能力代理层”的角色，而不是单纯窗口控制器。

## 3. 第二段通信：Main 到 Backend

### 3.1 通信形式

Main 到 Backend 当前使用本地 HTTP JSON 调用。

关键位置：

- `frontend/electron/runtime/backendSupervisor.ts`
- `backend/import/presto/main_api.py`

### 3.2 当前职责分配

`backendSupervisor.ts` 负责：

- 选择 Python 二进制
- 检测 PTSL 能力
- 选择端口
- 拉起后端进程
- 健康检查
- 代理能力调用

FastAPI 后端负责：

- 接收请求
- 解析 capability invoke envelope
- 执行业务 handler
- 返回统一响应

### 3.3 为什么不是 Renderer 直连 Backend

因为当前系统需要由主进程负责以下宿主级职责：

- 后端进程生命周期
- 端口发现
- 健康重试
- 主机级日志与错误记录

若 Renderer 直连后端，宿主边界会被打散，插件和页面也更容易越过控制面。

## 4. 第三段通信：Plugin 到 Host

### 4.1 通信形式

插件不是通过裸 HTTP 或裸 IPC 通信，而是通过宿主注入的 `PluginContext`：

- `presto`：能力调用客户端
- `runtime`：桌面运行时服务
- `storage`
- `logger`
- `locale`

关键定义：

- `packages/contracts/src/plugins/context.ts`
- `host-plugin-runtime/src/permissions/createPluginRuntime.ts`

### 4.2 这段通信的本质

它不是一个独立协议层，而是一个被宿主裁剪后的调用上下文。插件只能看到：

- manifest 已声明的能力
- manifest 已声明的 runtime 服务

因此，插件通信的核心不是“消息格式”，而是“权限裁剪后的 API 面”。

## 5. Capability 协议

Presto 跨层通信里最核心的稳定协议不是 IPC channel，也不是 HTTP path，而是 capability envelope。

关键定义位于：

- `packages/contracts/src/capabilities/*`
- `packages/contracts/src/capabilities/registry.ts`

调用 envelope 结构核心字段：

- `requestId`
- `capability`
- `payload`
- `meta`

返回 envelope：

- 成功：`success=true`
- 失败：`success=false`

这套模型的意义在于：

- 前端、插件、后端都围绕同一协议说话
- SDK 可以统一封装错误处理
- 权限声明可以直接绑定 capability ID

## 6. Runtime 服务协议

插件与宿主之间第二类稳定面是 Runtime 服务名集合，即 `PluginRuntimeServiceName`。

当前已出现的 runtime 服务包括：

- `automation.listDefinitions`
- `automation.runDefinition`
- `dialog.openFolder`
- `shell.openPath`
- `shell.openExternal`
- `fs.readFile`
- `fs.getHomePath`
- `fs.writeFile`
- `fs.ensureDir`
- `fs.readdir`
- `fs.stat`
- `mobileProgress.createSession`
- `mobileProgress.closeSession`
- `mobileProgress.getViewUrl`
- `mobileProgress.updateSession`
- `macAccessibility.preflight`
- `macAccessibility.runScript`
- `macAccessibility.runFile`

这些名字不是文档约定，而是实际类型约束。当前事实源位于 `packages/contracts-manifest/runtime-services.json`，并要求与 `packages/contracts-manifest/plugin-permissions.json` 中的 `allowedRuntimeServices` 精确一致。任何新增运行时服务都必须先更新这份 manifest，再进入生成产物、宿主实现和权限守卫。

## 7. 权限控制是如何落在通信层上的

当前插件权限不是在业务代码里“顺手 if 一下”，而是通信层级就做了访问裁剪：

### 7.1 Capability 权限守卫

实现位置：

- `host-plugin-runtime/src/permissions/guardCapabilityAccess.ts`

机制：

- 宿主读取插件 manifest 中的 `requiredCapabilities`
- 生成只暴露白名单能力的 `presto` client
- 插件调用未声明 capability 时直接抛出 `PLUGIN_PERMISSION_DENIED`

### 7.2 Runtime 权限守卫

实现位置：

- `host-plugin-runtime/src/permissions/guardRuntimeAccess.ts`

机制：

- 宿主读取 `requiredRuntimeServices`
- 仅注入允许访问的 runtime 子服务
- 未声明服务不可见或调用被拒绝

当前 `guardRuntimeAccess.ts` 已实际覆盖自动化运行时服务，包括 `automation.listDefinitions` 与 `automation.runDefinition`。

这意味着 Presto 的权限控制发生在“API 面装配阶段”，而不是事后审计阶段。

## 8. 请求追踪与错误传播

当前能力调用链可以形成较清晰的追踪线：

1. `sdk-core` 生成 `requestId`
2. Renderer 通过 `backend.invokeCapability` 发送请求
3. Main 记录调用日志与时长
4. Backend 以 capability envelope 执行业务
5. 错误经 `ErrorNormalizer` 统一输出

当前设计的意义是：

- 前端能关联一次请求与一次失败
- 插件也能看到统一错误结构
- 主进程可记录 capability 级别日志

## 9. 移动进度页通信

当前系统里有一条特殊通信链路：导出进度页。

实现涉及：

- `mobileProgressServer.ts`
- `mobileProgressPage.mjs`

这条链路的特点：

- 主进程生成会话与 token
- 页面通过 `/mobile-progress-api/<sessionId>?token=...` 拉取状态
- 它不是插件内通信，也不是标准前端主页面通信，而是宿主创建的附属访问面

因此文档上应将其归类为“宿主附属服务通信”，不能混进主业务 capability 协议。

## 10. 当前实现边界

### 已实现

- Renderer 到 Main 的类型化 IPC bridge
- Main 到 Backend 的本地 HTTP 调用
- 插件到宿主的受限 `PluginContext`
- capability envelope 调用模型
- runtime 服务白名单
- 插件 capability 权限白名单

### 当前不应写成已完成能力

- 插件独立进程级沙箱隔离
- 通用事件总线体系
- 完整双向订阅式通信协议
- 跨设备同步通信模型

## 11. 通信改动原则

任何跨边界功能新增，都必须先判断它属于哪一层：

1. 只是 Renderer 内部状态变化，不应新增 IPC。
2. 需要宿主系统能力，新增 Runtime 服务。
3. 需要后端业务能力，新增 Capability。
4. 需要插件可访问时，再补 manifest 权限项和守卫。

若把这四类变化混写在一起，Presto 的通信边界就会失控。
