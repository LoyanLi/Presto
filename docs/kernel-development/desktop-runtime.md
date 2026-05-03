# 桌面运行时

本文档聚焦桌面宿主层，也就是 `Tauri + Rust runtime + React host` 这一段。

## 1. 宿主根节点

当前桌面宿主根节点是 `src-tauri/src/main.rs`。

它负责：

- 创建 Tauri 应用
- 暴露统一 command：`runtime_invoke`
- 初始化运行时状态
- 处理桌面能力、插件管理、日志和后端监督

这里最关键的事实是：Rust 宿主不只是桌面壳。当前 Tauri 正式发布路径里，桌面运行时主逻辑已经直接实现在 Rust runtime。

## 2. Rust runtime 是什么

当前桌面运行时实现入口在 `src-tauri/src/runtime.rs`。

但当前结构已经不是一个继续膨胀的单文件 runtime：

- `src-tauri/src/runtime.rs`：根装配、共享 helper、operation dispatch
- `src-tauri/src/runtime/backend.rs`：backend supervisor、capability HTTP 转发、DAW target 切换
- `src-tauri/src/runtime/plugins.rs`：插件 catalog、安装/卸载、workflow definition 解析
- `src-tauri/src/runtime/mobile_progress.rs`：mobile progress session 和 HTTP 视图

领域状态也跟随领域模块放置：

- `BackendSupervisorState` 定义在 `runtime/backend.rs`
- `PluginCandidate` 和 workflow definition 引用定义在 `runtime/plugins.rs`
- `MobileProgressState` 定义在 `runtime/mobile_progress.rs`

`runtime.rs` 不再作为这些领域模型的集中定义文件；新增 runtime operation 时应优先落到对应模块，再由根 dispatch 暴露。

其中 DAW target 边界也已经拆出来：

- `src-tauri/src/runtime/backend.rs` 不再内联允许的 target 列表
- `src-tauri/src/runtime/daw_targets_generated.rs` 由 `packages/contracts-manifest/daw-targets.json` 生成，并提供 `DEFAULT_DAW_TARGET` 与 `SUPPORTED_DAW_TARGETS`

默认配置边界同样是生成产物：

- `packages/contracts-manifest/app-config-defaults.json` 是默认 app config 的唯一手工事实源
- `src-tauri/src/runtime/app_config_defaults_generated.rs` 提供 Rust runtime 需要的默认 config 和关键字段名
- `backend/presto/application/app_config_defaults_generated.py` 提供 Python config store 需要的默认 config
- `packages/contracts/src/generated/appConfigDefaults.ts` 提供 TypeScript 侧共享默认值

它负责装配这些运行时对象：

- backend supervisor
- plugin catalog / install / uninstall / enable
- mac accessibility preflight / execute
- mobile progress session
- 应用日志存储

Rust runtime 的职责是桌面业务宿主装配，而不是 UI 渲染。

当前 Rust runtime 也负责运行时日志落盘：

- 日志目录位于应用数据目录下的 `logs/`
- 每次应用启动生成一个新的 `presto-<timestamp>.log`
- 主日志行优先记录真实错误原因，只有额外上下文才追加紧凑 JSON
- execution lifecycle 事件现在也直接写回同一份 runtime log，不再单独分流到另一套日志面
- execution log 落盘格式当前统一为严格单行摘要，必要上下文以内联紧凑字段或 JSON 片段追加；默认先保证人类扫读和 grep 友好
- `daw.connection.getStatus`、`daw.adapter.getSnapshot`、`daw.session.getInfo`、`daw.track.list`、`daw.export.mixWithSource` 与 `jobs.get` 这类低信号成功态不会持续刷屏，失败态仍然保留
- `macAccessibility` 相关运行时失败如果命中辅助功能权限缺失，会被统一归类成 `MAC_ACCESSIBILITY_PERMISSION_REQUIRED`
- `mac-accessibility.script.run` 与 `mac-accessibility.file.run` 都会走同一套权限引导逻辑，而不是把原始 `osascript` 权限错误直接抛回上层

打包态 runtime 还依赖三条关键环境事实：

- Rust runtime 会优先从 bundle 内 `backend/`、`frontend/`、`plugins/` 解析运行时资源；开发态则直接回退到仓库根目录。
- Rust runtime 在选择 bundled Python runtime 时，会同时把 `PYTHONHOME` 指向包内 `Python.framework/Versions/3.13`，避免回退到用户机器本地 Python framework。
- Rust runtime 会把 `PRESTO_APP_DATA_DIR` 注入 Python 后端；后端默认 config store 因此会把配置持久化到 `<app data>/config.json`。
- Rust runtime 初始化 backend supervisor 时，会先读取 `<app data>/config.json` 里的 `hostPreferences.dawTarget`，把持久化目标 DAW 作为启动种子状态。

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

`0.3.6` 当前还补上了三条关键事实：

- 健康检查使用 Rust 侧本地 HTTP 请求直接轮询 `/api/v1/health`。
- 请求实现不能在写完后提前 `shutdown(Write)`；否则 uvicorn 不返回响应，宿主会误以为后端未就绪并主动清理进程。
- `backend.daw-target.set` 不再让 Renderer 双写配置；Rust runtime 会直接更新 `<app data>/config.json` 中的 `hostPreferences.dawTarget`，再原子执行 `stop -> set target -> start -> wait ready`。
- `backend.daw-target.set` 的持久化链路不依赖后端 `config.get/config.update` capability；目标 DAW 是 backend supervisor 的启动输入，不能反过来依赖正在被管理的 backend 完成写入。
- `backend.daw-target.set` 对可切换目标的校验来自 `runtime/daw_targets_generated.rs`，而不是 Rust runtime 内部另一份手写常量。
- `system.health` 和 `daw.connection.getStatus` 的语义现在保持纯查询；Rust runtime 只做状态读取和转发，不允许为了读状态而隐式触发连接。
- `/api/v1/capabilities/invoke` 的非 `200` 响应现在会被 Rust runtime 重新包装成 capability error envelope，保留 `requestId`、`capability`、结构化 `error`，并补上 `statusCode` / `statusLine`，而不是退化成 transport 层字符串错误。
- `/api/v1/capabilities` 返回的 snake_case metadata 会在 Rust runtime 中映射为 SDK runtime 使用的 camelCase 结构，包括 `workflowScope`、`portability`、`implementations`、`fieldSupport`、`canonicalSource` 和 `supportedDaws`。这条 list bridge 必须保持完整 metadata，不能只返回 UI 当前用到的字段。

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

当前插件宿主管理还新增了两条边界事实：

- 插件发现会保留所有已安装插件，不按当前 backend `target_daw` 直接裁剪；当前 DAW 下是否可用是 Host 渲染层的问题，不是安装目录发现的问题。
- manifest 校验已经前移到 Rust runtime，安装和扫描都会检查 `supportedDaws` 是否属于保留 target 集、各类声明是否重复、workflow definition 文件和 capability 引用是否闭合。
- tool 插件的本地资源执行链路也在宿主边界内收口：页面通过 `host.runTool(...)` 触发 runner，runner 只能通过已声明的 `toolRuntimePermissions` 和 `bundledResources` 调用 `process.execBundled(...)`。

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
- `host-plugin-runtime/browser` 的激活与挂载结果

## 7. 当前边界上最容易写错的点

- 当前不是 Electron preload 架构；`Tauri + runtime_invoke + Rust runtime` 才是主路径。
- `sdk-runtime` 是宿主 runtime SDK，不是插件正式 SDK。
- 插件页面虽然可以通过受限 `host` 请求目录选择，但这不等于插件拿到了通用 `runtime`。
- Rust runtime 是业务宿主层，不是后端替身；正式业务能力仍以 FastAPI capability 调用为中心。
