# 桌面运行时

本文档聚焦桌面宿主层，也就是 `Tauri + Node sidecar + React host` 这一段。

## 1. 宿主根节点

当前桌面宿主根节点是 `src-tauri/src/main.rs`。

它负责：

- 创建 Tauri 应用
- 启动 sidecar 进程
- 暴露统一 command：`runtime_invoke`
- 处理一部分桌面能力，如打开系统路径、打开外链、目录选择、文件系统操作

这里最关键的事实是：Rust 宿主只保留桌面壳和命令入口，不直接承担完整业务编排。

## 2. Sidecar 是什么

当前 sidecar 入口在 `frontend/sidecar/main.ts`。

它负责装配这些运行时对象：

- `createBackendSupervisor(...)`
- `createPluginHostService(...)`
- `createAutomationRuntime(...)`
- `createMacAccessibilityRuntime(...)`
- `createMobileProgressRuntimeController(...)`
- 应用日志存储

sidecar 的职责是业务宿主装配，而不是 UI 渲染。

## 3. Renderer 怎样访问宿主

Renderer 侧的关键入口是：

- `frontend/tauri/runtimeBridge.ts`
- `frontend/desktop/runtimeBridge.ts`
- `frontend/tauri/renderer.tsx`

当前调用方式是：

1. Renderer 使用类型化 operation 表
2. 通过 Tauri `invoke('runtime_invoke', ...)` 发起调用
3. Rust 宿主把请求转发给 sidecar 或直接执行部分宿主操作
4. Renderer 得到结构化返回值

当前已组织好的 runtime 领域包括：

- `app`
- `automation`
- `backend`
- `dialog`
- `shell`
- `fs`
- `plugins`
- `window`
- `mobileProgress`
- `macAccessibility`

## 4. Backend Supervisor 在桌面侧的位置

`frontend/runtime/backendSupervisor.ts` 负责把 Python FastAPI 后端当作本地受控服务来管理。

它会处理：

- 解析 backend 根目录
- 选择 Python 可执行文件
- 检测 PTSL 支持情况
- 选择端口
- 启动后端
- 轮询 `/api/v1/health`
- 转发 capability 调用

所以 Renderer 侧看到的是 `backend.invokeCapability(...)`，而不是裸 HTTP 细节。

## 5. 插件宿主服务在桌面侧的位置

`frontend/runtime/pluginHostService.ts` 是 sidecar 中的插件宿主管理器。

它负责：

- 插件目录发现
- 插件安装 / 卸载
- 官方插件同步
- manifest 校验结果汇总
- 插件入口可加载性检查
- workflow definition 解析

这一层只负责宿主级插件管理，不负责 React 页面渲染。

## 6. React Host 的职责

`frontend/host/` 负责：

- Host Shell 页面
- 首页、设置页、开发者页面
- 插件列表和插件问题展示
- 把宿主 catalog 转成可渲染页面、导航、命令和设置项

当前 React Host 不是协议定义层。它消费的是：

- `packages/contracts`
- `packages/sdk-core`
- `packages/sdk-runtime`
- `host-plugin-runtime` 的挂载结果

## 7. 当前边界上最容易写错的点

- 当前不是 Electron preload 架构；`Tauri + runtime_invoke + sidecar` 才是主路径。
- `sdk-runtime` 是宿主 runtime SDK，不是插件正式 SDK。
- 插件页面虽然可以通过受限 `host` 请求目录选择，但这不等于插件拿到了通用 `runtime`。
- sidecar 是业务宿主层，不是后端替身；正式业务能力仍以 FastAPI capability 调用为中心。
