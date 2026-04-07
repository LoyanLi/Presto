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

当前 sidecar 也负责运行时日志落盘：

- 日志目录位于应用数据目录下的 `logs/`
- 每次应用启动生成一个新的 `presto-<timestamp>.log`
- 主日志行优先记录真实错误原因，只有额外上下文才追加紧凑 JSON
- `macAccessibility` 相关运行时失败如果命中辅助功能权限缺失，会被统一归类成 `MAC_ACCESSIBILITY_PERMISSION_REQUIRED`
- sidecar 会把 `automation.definition.run`、`mac-accessibility.script.run`、`mac-accessibility.file.run` 这三类入口统一包进权限引导逻辑，而不是把原始 `osascript` 权限错误直接抛回上层

打包态 sidecar 还依赖两条关键环境事实：

- Rust 宿主会注入 `PRESTO_RESOURCES_DIR`，sidecar 由此解析 bundled backend、官方插件和自动化定义目录。
- `frontend/runtime/backendSupervisor.ts` 在选择 bundled Python runtime 时，会同时把 `PYTHONHOME` 指向包内 `Python.framework/Versions/3.13`，避免回退到用户机器本地 Python framework。

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

其中 `macAccessibility` 当前还有两个明确事实：

- React Host 在应用启动时会主动调用 `developerRuntime.macAccessibility.preflight()` 做一次预检。
- 如果缺少 macOS Accessibility 权限，宿主弹窗和 sidecar 运行时弹窗都会给出同一条引导：去 `System Settings > Privacy & Security > Accessibility` 为 Presto 授权。

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

当前 backend supervisor 的失败路径也会写入运行时日志，包括：

- backend 启动失败
- health check 失败后的重启
- capability list / invoke 失败
- backend stderr
- backend 进程退出

从 `0.3.3` 起，bundled Python runtime 的打包事实还包括：

- `scripts/prepare-tauri-python.mjs` 会把运行时需要的 `Python.framework`、标准库和动态库依赖一起带入安装包。
- `scripts/prepare-tauri-python.mjs` 会按 `PRESTO_TAURI_TARGET` 验证 bundled runtime 的目标架构；如果共享运行时目录里的 `.so` 扩展不包含当前目标架构，就不会复用旧目录，而是重新按目标架构创建 `venv`、安装 wheels，再用 `python.staging` 原子替换。
- `_ssl`、`_hashlib` 等扩展对 `libssl` / `libcrypto` 的引用已经改写到 bundle 内相对路径。
- 标准库中的 `test`、`config-3.13-darwin`、`idlelib`、`tkinter`、`turtledemo`、`__phello__`、`ensurepip` 与缓存目录会在打包阶段被剔除，以缩小 `.app` 和 `.dmg` 体积。

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
