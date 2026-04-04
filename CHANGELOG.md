# Changelog

## 0.3.0

- 正式以 `Tauri + Node sidecar + Python FastAPI` 作为桌面宿主发布主线，Electron 运行链退出当前发布路径。
- 收口 workflow、插件、宿主设置与主题切换边界，统一 `frontend -> sidecar -> backend` 的执行链路。
- 修复 workflow definition / allowed capabilities 装配、Import Workflow 阶段进度、打包态资源路径与 `tauri dev` 旧资源快照问题。
- macOS 发布图标链改为直接复用旧 Electron 成功产物中的 `Assets.car`、`icon.icns` 和 plist 约定，避免当前 Xcode 26 `.icon` 编译链的不稳定问题。
- 提供独立 `arm64` 与 `x64` macOS 安装包输出。
