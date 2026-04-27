# Changelog

本文件按发布顺序汇总用户可见变化；`0.3.x` 正式版本的完整发布说明和安装包校验值见对应 `docs/releases/v*-release.md`。

## [0.3.10](docs/releases/v0.3.10-release.md) - 2026-04-27

- 导出执行链路补齐明确生命周期事件：`export.run.accepted`、`export.run.started`、`export.file.succeeded`、`export.run.succeeded`、`export.run.failed`，原始 runtime log 终于能按真实顺序反映导出状态。
- runtime log 继续写回同一份原始日志文件，但 execution log 现在收紧为严格单行可读摘要；必要上下文以内联紧凑字段追加，不再被多行 JSON 撕碎。
- 低信号成功态日志被进一步收紧：`daw.connection.getStatus`、`daw.adapter.getSnapshot`、`daw.session.getInfo`、`daw.track.list`、`daw.export.mixWithSource` 和 `jobs.get` 不再持续把日志刷成轮询噪音。
- 插件宿主会抑制紧邻的重复 activation 日志；官方插件激活不再在原始日志里成对重复出现。
- backend supervisor 现在会正确识别 backend `stderr` 的级别，并清理 ANSI 控制字符；`Uvicorn INFO` 不再误记成 `error`。
- Tauri `runtime_invoke` 改成异步命令，并把 `backend.*` 调用移到 `spawn_blocking`；导出期间慢 invoke 不再直接卡住宿主命令处理线程。
- macOS DMG 重新整理为 Finder 风格安装窗口：自定义背景、隐藏工具栏/状态栏/路径栏/标签栏，并固定 `Presto.app`、`Applications` 和辅助 command 的图标位置，避免默认列表视图和滚动条影响安装观感。
- DMG 根目录新增一键 `打不开时运行.command`；用户把 `Presto.app` 拖进 Applications 后，可直接运行该 command 移除 `/Applications/Presto.app` 的 quarantine 标记。
- `0.3.10` 双架构安装包已重新生成并补齐校验值：`arm64` `c9036fec7c43014e3a35df92f1e048845f3962d23427d9071e272a04f3ff70c1`，`x64` `2d84f4f7c4e62f656db977e3bd02c9626d0a6b45da4b2437b9ae9e112e0727c1`。

## [0.3.9](docs/releases/v0.3.9-release.md) - 2026-04-19

- `Runs` 页面交互改为“默认总览 -> 单类详情”：默认先显示 `workflow`、`automation`、`tool`、`command` 四类总览卡片，进入详情后只保留单一榜单，并通过顶部 tabs 在各类别之间切换。
- `Runs` 页面总览卡片现在直接显示每类累计次数、当前最高频项和最近使用时间，避免四份榜单同时展开造成信息层级膨胀。
- 新增官方 `official.time-calculator-tool`，作为纯前端 `tool` 插件参考实现：不依赖 runner、不声明 capability，直接在 `Tools` 页提供 `BPM -> Time`、`Time -> BPM` 与 `Reverb / Pre-delay` 计算。
- `official.time-calculator-tool` 使用插件内部本地化和独立样式，并把常用时值列表限制为卡片内滚动区域，避免工具页继续拉长。

## [0.3.8](docs/releases/v0.3.8-release.md) - 2026-04-13

- 正式引入 `tool` 插件类型：contracts、host runtime、Tauri runtime 和插件装配链现在都把 `Tools` 作为一等表面，支持 `tool.run`、受限 `dialog/fs/shell` 页面 host 和 `process.execBundled` runner 闭环。
- 宿主新增 `Tools` 页面与 `Tool Extensions` 设置分组；tool 插件不再混入 workflow 列表，而是通过独立工具表面和独立扩展管理入口接入。
- 新增官方 `official.atmos-video-mux-tool` 参考插件，携带 `ffmpeg`、`ffprobe`、`mp4demuxer`、`mp4muxer` 与封装脚本，作为当前正式 `tool` 插件样例。
- Atmos mux 工具页继续向 workflow 壳层收口：改为两步流 `Sources` / `Output / Review / Run`，复用共享 stepper / panel / 底部 action bar，并移除重复路径、`jobId` 与冗余结果块。
- 宿主运行统计继续接入 `tools` 维度；成功 tool job 现在可以进入 runs metrics 统计口径。
- 仓库许可证基线补齐为 `AGPL-3.0-only`，并同步到 README、包元数据与 Rust crate 元数据。
- 统一应用、workspace package、Tauri、Rust crate 与 backend 版本基线到 `0.3.8`。

## [0.3.7](docs/releases/v0.3.7-release.md) - 2026-04-12

- 宿主新增独立 `Runs` 页面，统一展示 `workflow`、`automation`、`command` 三个维度的成功运行排行。
- `workflow` 统计口径改为“成功完成的 workflow job”；`workflow.run.start` 不再计入 workflow 榜，但继续计入 command 榜。
- workflow 成功执行时会把内部每次成功 command 调用一并累计到 command 榜，榜单现在反映实际运行次数，而不是仅反映 workflow 入口次数。
- command 榜支持宿主侧文字译名显示，页面布局和交互语言与现有 host shell 保持同一套卡片、配色和滚动规则。
- 删除未继续使用的静态 landing preview 入口和相关目录。
- 仓库许可证基线明确为 `AGPL-3.0-only`，并把 README、包元数据与 Rust crate 元数据统一到同一 SPDX 标识。

## [0.3.6](docs/releases/v0.3.6-release.md) - 2026-04-12

- public capability registry 统一收口到 `daw.*` 命名空间，workflow / automation manifest 与 `usesCapability` 声明现在都对齐同一套 capability ID。
- Pro Tools 的 `PTSL` 语义封装继续并入 canonical capability surface；生成产物、后端 handler registry、SDK client、插件 manifest 与 Developer Console 现在都围绕同一份 registry 元数据工作。
- 保持插件运行时客户端接口稳定：workflow / automation 继续通过 `presto.session.*`、`presto.track.*`、`presto.import.*` 等既有入口执行，不引入并行的 `presto.daw.*` runtime API。
- 修复宿主 DAW 状态轮询误读 `developerPresto.daw.session.getInfo()` 的回归；当前统一改回 canonical `developerPresto.session.getInfo()`。
- 统一应用、workspace package、Tauri 与 FastAPI 版本基线到 `0.3.6`。

## [0.3.5](docs/releases/v0.3.5-release.md) - 2026-04-10

- 后端引入 `backend/presto/application/daw_runtime.py` 作为 DAW 运行时依赖解析入口，`build_service_container()` 通过 `target_daw` 统一解析 `daw`、`mac_automation` 和 `daw_ui_profile`，为后续多 DAW 扩展保留清晰接缝，但当前仍只接通 `pro_tools`。
- DAW target 列表进入 `packages/contracts-manifest/daw-targets.json`，并生成 TypeScript / Python / Rust 三端共享产物，消除跨语言手写 target 常量漂移。
- capability 执行链收口为“capability definition -> direct handler registry -> single execution context”，减少后端 handler 分发绕行。
- React Host 进一步拆分为明确边界：`HostShellApp` 负责界面组合，偏好状态和导航状态分别下沉到独立 hook，桌面插件目录装配下沉到 `frontend/desktop/useHostPluginCatalogState.ts`。
- 修复 `backend.daw-target.set` 只停后端不重启的问题，切换目标 DAW 现在会原子执行 `stop -> set target -> start -> wait ready`。
- 修复插件目录刷新失败后继续保留旧插件状态的问题，失败时会清空旧 entries 并替换成干净的 error model。
- 删除 `frontend/electron/`、`frontend/sidecar/`、`frontend/runtime/` 历史路径，并把桌面自动化执行主路径统一收口到插件 `automationItems`。
- 统一应用、workspace package、Tauri 与 FastAPI 版本基线到 `0.3.5`。
- `2026-04-10` 已按当前 `0.3.5` 代码基线重打 `arm64` / `x64` 安装包，并刷新发布说明中的产物校验值与体积基线。

## [0.3.4](docs/releases/v0.3.4-release.md) - 2026-04-09

- 修复 Tauri 正式打包链在生成 `.app` 后没有把 `backend`、`frontend`、`plugins` 资源同步进最终 bundle 的问题，避免出现能打包成功但安装包实际缺少运行时资源的空壳 App。
- 修复 Tauri Rust runtime 的本地 HTTP 健康检查实现，避免后端已经启动成功后又被宿主误判失败并清理，导致主页面之外的功能全部不可用。
- Tauri 启动链改为单窗口启动，移除独立 splashscreen 窗口，主窗口直接承载启动壳层。
- 文档与技术文档基线统一更新到当前真实架构：正式发布路径是 `Tauri + Rust runtime + React + Python FastAPI`，不再把 Node sidecar 写成 Tauri 主线事实。
- `0.3.4` 双架构正式安装包已完成验证：`arm64` 约 `79.8M .app / 27.1M .dmg`，`x64` 约 `81.0M .app / 27.4M .dmg`。
- 统一应用、workspace package、Tauri 与 FastAPI 版本基线到 `0.3.4`。

## [0.3.3](docs/releases/v0.3.3-release.md) - 2026-04-07

- macOS 辅助功能权限现在会在应用每次启动时主动预检；任何依赖 Accessibility 的运行时执行在权限缺失时都会先弹出明确引导，而不是只返回底层 `osascript` 报错。
- 新增应用启动自动检查 GitHub release 更新，支持用户选择是否纳入预览版。
- 宿主现在会在发现新版本时弹出更新提示，并可直接打开发布页。
- 修复 Tauri 安装包中的 bundled Python runtime 仍然外链本机 `/Library/Frameworks/Python.framework`，避免用户机器未安装同版本 Python 时后端启动即崩。
- bundled Python 现在一并携带所需 `Python.framework` 运行时资源，并重写解释器动态库引用后做 ad-hoc 签名。
- 收口 `fastapi` / `uvicorn` helper script 与 `pyvenv.cfg` 中的构建机绝对路径，避免安装包继续泄露本地 `python.staging` 路径。
- bundled Python runtime 进一步剔除 `test`、`config-3.13-darwin`、`idlelib`、`tkinter`、`turtledemo`、`__phello__`、`ensurepip` 与缓存目录，显著缩小正式安装包体积。
- 统一应用、workspace package、Tauri 与 FastAPI 版本基线到 `0.3.3`。

## [0.3.2-1](docs/releases/v0.3.2-release.md) - 2026-04-06

- 重新切出 `0.3.2` 安装包资产，保持代码基线不扩张，目标是补齐当日发布产物替换链路。
- 该 tag 只包含 release cut 提交；功能变化仍以 `0.3.2` 正式条目为准。

## [0.3.2](docs/releases/v0.3.2-release.md) - 2026-04-06

- 引入内部全量 PTSL catalog 与 runner，明确把 Pro Tools 原生命令接入收口到统一底层执行层。
- 公共 capability 元数据新增 `supportedDaws`、`canonicalSource` 与 `fieldSupport`，并在后端 invoke 链路里对声明字段做显式校验。
- 收口 track toggle canonical baseline：`mute`、`solo` 改为 batch 语义，并新增 `recordEnable`、`recordSafe`、`inputMonitor`、`online`、`frozen`、`open` 六个公共 track toggle capability。
- Developer Console 改为读取后端 capability metadata，并显示 canonical source / supported DAWs / field support。
- 统一应用、workspace package、Tauri 与 FastAPI 版本基线到 `0.3.2`。

## [0.3.1](docs/releases/v0.3.1-release.md) - 2026-04-05

- 宿主设置中心把 `Workflow Extensions` 与 `Automation Extensions` 收口到同一套 extension management 链路，统一支持刷新、安装目录、安装 zip、启用、禁用与已安装扩展卸载。
- automation 宿主改为根据已安装 automation 插件渲染卡片，不再继续把 `splitStereoToMono` 作为唯一硬编码入口。
- automation 首页卡片改为各自独立高度布局，避免单一卡片内容把整页卡片一起拉高。
- 官方 `batch-ara-backup-automation` 当前先落版备份阶段：批量复制当前选中轨道、把复制出的备份轨统一重命名为 `.bak`，再隐藏并 inactive。
- 新增 track hidden / inactive 与批量 track state 的内核封装，供 automation 插件直接复用。
- 修复 `Workflow Extensions` / `Automation Extensions` 设置页在固定宿主壳层中的滚动链。
- 修复 Tauri 打包前 bundled Python runtime 的 staging 过程，避免资源准备阶段缺失运行时目录。

## [0.3.0](docs/releases/v0.3.0-release.md) - 2026-04-04

- 正式以 `Tauri + Node sidecar + Python FastAPI` 作为桌面宿主发布主线，Electron 运行链退出当前发布路径。
- 收口 workflow、插件、宿主设置与主题切换边界，统一 `frontend -> sidecar -> backend` 的执行链路。
- 修复 workflow definition / allowed capabilities 装配、Import Workflow 阶段进度、打包态资源路径与 `tauri dev` 旧资源快照问题。
- macOS 发布图标链改为直接复用旧 Electron 成功产物中的 `Assets.car`、`icon.icns` 和 plist 约定，避免当前 Xcode 26 `.icon` 编译链的不稳定问题。
- 提供独立 `arm64` 与 `x64` macOS 安装包输出。

## Pre-release History

### 0.3.0-alpha.2 - 2026-04-03

- 关闭 `0.3.0` alpha2 发布链路，补齐 x64 资产记录。
- 稳定 bundled runtime 与 import workflow staging，减少从 alpha 进入正式 `0.3.0` 前的打包态运行偏差。

### 0.3.0-alpha.1 - 2026-04-03

- 首次把桌面主线迁移到 Tauri host，并把插件执行边界从旧 frontend/sidecar 形态继续向 backend 收口。
- 统一 workflow setup、host UI 与主题能力，开始建立 `0.3.x` 的桌面发布基线。
- 重打 alpha 安装包并同步双架构构建材料，为 `0.3.0` 正式版验证 macOS 打包链。

## Legacy Releases

### 0.2.2 - 2026-03-15

- README 补充 unsigned macOS app 打开指引，降低本地未签名包首次运行的阻力。
- runtime log 结构标准化，诊断输出从分散日志继续向统一可读日志收口。
- Import UI 支持键盘多选行，批量导入操作更接近桌面表格交互预期。
- 设置侧新增 GitHub release update checks，为后续 `0.3.x` 的启动更新提示打基础。
- 仓库忽略规则补入 PTSL 与 Avid SDK artifact，避免本地 SDK 和生成物误入版本库。

### 0.2.1 - 2026-03-14

- 同步 runtime architecture 与贡献文档，修正 `0.2.0` 后桌面运行链路的说明材料。
- 该版本主要是发布材料和仓库说明收口，不引入新的用户功能面。

### 0.2.0 - 2026-03-14

- 建立 `0.2` 核心桌面工作流：Phase 0-3 设置流程、Import/Export package 边界和运行态状态展示进入同一条主线。
- backend supervisor 收口到单端口运行模型，提升本地桌面宿主与后端服务之间的启动稳定性。
- Import 稳定性和性能提升，并补充更友好的进度与错误提示。
- Export mobile progress 新增 QR progress panel，用于移动端查看导出进度。
- renderer logs 开始进入诊断采集，减少只看后端日志时定位不到前端问题的情况。
- Track2Do 的 bit depth 显示修正为 `32-bit float`。

### 0.1.0 - 2026-03-03

- 项目命名收口为 Presto，并移除早期 Python frontend 形态。
- 初步拆分 frontend/backend，整理 import/export packaging 边界。
- 后端路由模块化，Import run-state 修复和基础文档进入首个发布基线。
