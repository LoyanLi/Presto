# Changelog

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
