# Changelog

## 0.3.5

- 后端引入 `backend/presto/application/daw_runtime.py` 作为 DAW 运行时依赖解析入口，`build_service_container()` 通过 `target_daw` 统一解析 `daw`、`mac_automation` 和 `daw_ui_profile`，为后续多 DAW 扩展保留清晰接缝，但当前仍只接通 `pro_tools`。
- DAW target 列表进入 `packages/contracts-manifest/daw-targets.json`，并生成 TypeScript / Python / Rust 三端共享产物，消除跨语言手写 target 常量漂移。
- capability 执行链收口为“capability definition -> direct handler registry -> single execution context”，减少后端 handler 分发绕行。
- React Host 进一步拆分为明确边界：`HostShellApp` 负责界面组合，偏好状态和导航状态分别下沉到独立 hook，桌面插件目录装配下沉到 `frontend/desktop/useHostPluginCatalogState.ts`。
- 修复 `backend.daw-target.set` 只停后端不重启的问题，切换目标 DAW 现在会原子执行 `stop -> set target -> start -> wait ready`。
- 修复插件目录刷新失败后继续保留旧插件状态的问题，失败时会清空旧 entries 并替换成干净的 error model。
- 删除 `frontend/electron/`、`frontend/sidecar/`、`frontend/runtime/` 历史路径，并把自动化资源主路径统一到 `frontend/tauri/resources/automation/`。
- 统一应用、workspace package、Tauri 与 FastAPI 版本基线到 `0.3.5`。

## 0.3.4

- 修复 Tauri 正式打包链在生成 `.app` 后没有把 `backend`、`frontend`、`plugins` 资源同步进最终 bundle 的问题，避免出现能打包成功但安装包实际缺少运行时资源的空壳 App。
- 修复 Tauri Rust runtime 的本地 HTTP 健康检查实现，避免后端已经启动成功后又被宿主误判失败并清理，导致主页面之外的功能全部不可用。
- Tauri 启动链改为单窗口启动，移除独立 splashscreen 窗口，主窗口直接承载启动壳层。
- 文档与技术文档基线统一更新到当前真实架构：正式发布路径是 `Tauri + Rust runtime + React + Python FastAPI`，不再把 Node sidecar 写成 Tauri 主线事实。
- `0.3.4` 双架构正式安装包已完成验证：`arm64` 约 `79.8M .app / 27.1M .dmg`，`x64` 约 `81.0M .app / 27.4M .dmg`。
- 统一应用、workspace package、Tauri 与 FastAPI 版本基线到 `0.3.4`。

## 0.3.3

- macOS 辅助功能权限现在会在应用每次启动时主动预检；任何依赖 Accessibility 的运行时执行在权限缺失时都会先弹出明确引导，而不是只返回底层 `osascript` 报错。
- 新增应用启动自动检查 GitHub release 更新，支持用户选择是否纳入预览版。
- 宿主现在会在发现新版本时弹出更新提示，并可直接打开发布页。
- 修复 Tauri 安装包中的 bundled Python runtime 仍然外链本机 `/Library/Frameworks/Python.framework`，避免用户机器未安装同版本 Python 时后端启动即崩。
- bundled Python 现在一并携带所需 `Python.framework` 运行时资源，并重写解释器动态库引用后做 ad-hoc 签名。
- 收口 `fastapi` / `uvicorn` helper script 与 `pyvenv.cfg` 中的构建机绝对路径，避免安装包继续泄露本地 `python.staging` 路径。
- bundled Python runtime 进一步剔除 `test`、`config-3.13-darwin`、`idlelib`、`tkinter`、`turtledemo`、`__phello__`、`ensurepip` 与缓存目录，显著缩小正式安装包体积。
- 统一应用、workspace package、Tauri 与 FastAPI 版本基线到 `0.3.3`。

## 0.3.2

- 引入内部全量 PTSL catalog 与 runner，明确把 Pro Tools 原生命令接入收口到统一底层执行层。
- 公共 capability 元数据新增 `supportedDaws`、`canonicalSource` 与 `fieldSupport`，并在后端 invoke 链路里对声明字段做显式校验。
- 收口 track toggle canonical baseline：`mute`、`solo` 改为 batch 语义，并新增 `recordEnable`、`recordSafe`、`inputMonitor`、`online`、`frozen`、`open` 六个公共 track toggle capability。
- Developer Console 改为读取后端 capability metadata，并显示 canonical source / supported DAWs / field support。
- 统一应用、workspace package、Tauri 与 FastAPI 版本基线到 `0.3.2`。

## 0.3.1

- 宿主设置中心把 `Workflow Extensions` 与 `Automation Extensions` 收口到同一套 extension management 链路，统一支持刷新、安装目录、安装 zip、启用、禁用与已安装扩展卸载。
- automation 宿主改为根据已安装 automation 插件渲染卡片，不再继续把 `splitStereoToMono` 作为唯一硬编码入口。
- automation 首页卡片改为各自独立高度布局，避免单一卡片内容把整页卡片一起拉高。
- 官方 `batch-ara-backup-automation` 当前先落版备份阶段：批量复制当前选中轨道、把复制出的备份轨统一重命名为 `.bak`，再隐藏并 inactive。
- 新增 track hidden / inactive 与批量 track state 的内核封装，供 automation 插件直接复用。
- 修复 `Workflow Extensions` / `Automation Extensions` 设置页在固定宿主壳层中的滚动链。
- 修复 Tauri 打包前 bundled Python runtime 的 staging 过程，避免资源准备阶段缺失运行时目录。

## 0.3.0

- 正式以 `Tauri + Node sidecar + Python FastAPI` 作为桌面宿主发布主线，Electron 运行链退出当前发布路径。
- 收口 workflow、插件、宿主设置与主题切换边界，统一 `frontend -> sidecar -> backend` 的执行链路。
- 修复 workflow definition / allowed capabilities 装配、Import Workflow 阶段进度、打包态资源路径与 `tauri dev` 旧资源快照问题。
- macOS 发布图标链改为直接复用旧 Electron 成功产物中的 `Assets.car`、`icon.icns` 和 plist 约定，避免当前 Xcode 26 `.icon` 编译链的不稳定问题。
- 提供独立 `arm64` 与 `x64` macOS 安装包输出。
