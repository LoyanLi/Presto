# 桌面运行时

本文档聚焦桌面宿主层，也就是 `Tauri + Rust runtime + React host` 这一段。

## 1. 宿主根节点

当前桌面宿主根节点是 `src-tauri/src/main.rs`。

它负责：

- 创建 Tauri 应用
- 暴露统一 command：`runtime_invoke`
- 初始化运行时状态
- 处理桌面能力、插件管理、自动化入口、日志和后端监督

这里最关键的事实是：Rust 宿主不只是桌面壳。当前 Tauri 正式发布路径里，桌面运行时主逻辑已经直接实现在 Rust runtime。

## 2. Rust runtime 是什么

当前桌面运行时实现入口在 `src-tauri/src/runtime.rs`。

但当前结构已经不是一个继续膨胀的单文件 runtime：

- `src-tauri/src/runtime.rs`：根状态、共享 helper、operation dispatch
- `src-tauri/src/runtime/backend.rs`：backend supervisor、capability HTTP 转发、DAW target 切换
- `src-tauri/src/runtime/plugins.rs`：插件 catalog、安装/卸载、automation definition
- `src-tauri/src/runtime/mobile_progress.rs`：mobile progress session 和 HTTP 视图

其中 DAW target 边界也已经拆出来：

- `src-tauri/src/runtime/backend.rs` 不再内联允许的 target 列表
- `src-tauri/src/runtime/daw_targets_generated.rs` 由 `packages/contracts-manifest/daw-targets.json` 生成，并提供 `DEFAULT_DAW_TARGET` 与 `SUPPORTED_DAW_TARGETS`

它负责装配这些运行时对象：

- backend supervisor
- plugin catalog / install / uninstall / enable
- automation definition list / run
- mac accessibility preflight / execute
- mobile progress session
- 应用日志存储

Rust runtime 的职责是桌面业务宿主装配，而不是 UI 渲染。

当前 Rust runtime 也负责运行时日志落盘：

- 日志目录位于应用数据目录下的 `logs/`
- 每次应用启动生成一个新的 `presto-<timestamp>.log`
- 主日志行优先记录真实错误原因，只有额外上下文才追加紧凑 JSON
- `macAccessibility` 相关运行时失败如果命中辅助功能权限缺失，会被统一归类成 `MAC_ACCESSIBILITY_PERMISSION_REQUIRED`
- `automation.definition.run`、`mac-accessibility.script.run`、`mac-accessibility.file.run` 这三类入口都会走同一套权限引导逻辑，而不是把原始 `osascript` 权限错误直接抛回上层

打包态 runtime 还依赖三条关键环境事实：

- Rust runtime 会优先从 bundle 内 `backend/`、`frontend/`、`plugins/` 解析运行时资源；开发态则直接回退到仓库根目录。
- Rust runtime 在选择 bundled Python runtime 时，会同时把 `PYTHONHOME` 指向包内 `Python.framework/Versions/3.13`，避免回退到用户机器本地 Python framework。
- Rust runtime 会把 `PRESTO_APP_DATA_DIR` 注入 Python 后端；后端默认 config store 因此会把配置持久化到 `<app data>/config.json`。

## 3. Renderer 怎样访问宿主

Renderer 侧的关键入口是：

- `frontend/desktop/renderHostShellApp.tsx`
- `frontend/desktop/useHostPluginCatalogState.ts`
- `frontend/tauri/runtimeBridge.ts`
- `frontend/desktop/runtimeBridge.ts`
- `frontend/tauri/renderer.tsx`

当前调用方式是：

1. Renderer 使用类型化 operation 表
2. 通过 Tauri `invoke('runtime_invoke', ...)` 发起调用
3. Rust runtime 直接执行宿主操作，或把 capability 请求转发给本地 FastAPI
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
- 如果缺少 macOS Accessibility 权限，宿主弹窗和运行时弹窗都会给出同一条引导：去 `System Settings > Privacy & Security > Accessibility` 为 Presto 授权。

## 4. Backend Supervisor 在桌面侧的位置

`src-tauri/src/runtime/backend.rs` 负责把 Python FastAPI 后端当作本地受控服务来管理。

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

`0.3.5` 当前还补上了三条关键事实：

- 健康检查使用 Rust 侧本地 HTTP 请求直接轮询 `/api/v1/health`。
- 请求实现不能在写完后提前 `shutdown(Write)`；否则 uvicorn 不返回响应，宿主会误以为后端未就绪并主动清理进程。
- `backend.daw-target.set` 不能只改状态；当前实现会原子执行 `stop -> set target -> start -> wait ready`，保证切换目标 DAW 后紧随其后的宿主配置读写仍然面对一个存活后端。
- `backend.daw-target.set` 对可切换目标的校验来自 `runtime/daw_targets_generated.rs`，而不是 Rust runtime 内部另一份手写常量。
- `system.health` 和 `daw.connection.getStatus` 的语义现在保持纯查询；Rust runtime 只做状态读取和转发，不允许为了读状态而隐式触发连接。

从 `0.3.3` 起，bundled Python runtime 的打包事实还包括：

- `scripts/prepare-tauri-python.mjs` 会把运行时需要的 `Python.framework`、标准库和动态库依赖一起带入安装包。
- `scripts/prepare-tauri-python.mjs` 会按 `PRESTO_TAURI_TARGET` 验证 bundled runtime 的目标架构；如果共享运行时目录里的 `.so` 扩展不包含当前目标架构，就不会复用旧目录，而是重新按目标架构创建 `venv`、安装 wheels，再用 `python.staging` 原子替换。
- `scripts/prepare-tauri-python.mjs` 当前把包内 Python 视为 Presto backend 专用 runtime，而不是通用解释器：会递归删除 `__pycache__`、`.pyc`、`.pyi`、`venv`、`unittest`、`pydoc_data`、`lib2to3` 等冗余内容，并只保留后端导入闭包需要的 `lib-dynload` 扩展。
- `_ssl`、`_hashlib` 等扩展对 `libssl` / `libcrypto` 的引用已经改写到 bundle 内相对路径。
- 打包阶段会对保留的 Python / OpenSSL / site-packages 原生二进制统一执行 `strip -x`，再重新 ad-hoc 签名，进一步压缩运行时体积。
- 标准库中的 `test`、`config-3.13-darwin`、`idlelib`、`tkinter`、`turtledemo`、`__phello__`、`ensurepip` 与缓存目录会在打包阶段被剔除，以缩小 `.app` 和 `.dmg` 体积。
- `scripts/package-tauri-build.mjs` 会在每次正式打包后生成 `release/tauri/<arch>/size-report.json`，用于记录 `.app`、`.dmg`、`Resources`、`site-packages` 与 Python stdlib 的体积分布，并把最终 DMG 压缩格式固定为 `UDBZ`。

## 5. 插件宿主服务在桌面侧的位置

插件宿主管理逻辑当前位于 `src-tauri/src/runtime/plugins.rs`，由 `src-tauri/src/runtime.rs` 根调度器分发。

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

当前宿主状态边界还新增了两条明确事实：

- `HostShellApp.tsx` 主要负责 UI 组合；偏好和导航分别下沉到 `useHostShellPreferencesState.ts` 与 `useHostShellNavigationState.ts`。
- 桌面侧插件目录发现、安装、刷新和错误态收口由 `frontend/desktop/useHostPluginCatalogState.ts` 负责；刷新失败时不会继续保留旧插件页面和旧自动化卡片。

当前 React Host 不是协议定义层。它消费的是：

- `packages/contracts`
- `packages/sdk-core`
- `packages/sdk-runtime`
- `host-plugin-runtime` 的挂载结果

## 7. 当前边界上最容易写错的点

- 当前不是 Electron preload 架构；`Tauri + runtime_invoke + Rust runtime` 才是主路径。
- `sdk-runtime` 是宿主 runtime SDK，不是插件正式 SDK。
- 插件页面虽然可以通过受限 `host` 请求目录选择，但这不等于插件拿到了通用 `runtime`。
- Rust runtime 是业务宿主层，不是后端替身；正式业务能力仍以 FastAPI capability 调用为中心。
