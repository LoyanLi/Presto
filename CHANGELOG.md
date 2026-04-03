# Changelog

All notable changes to this project are documented in this file.

## [0.3.0-alpha.1] - 2026-04-03

### Added
- workflow 插件执行边界正式收口到 `sidecar -> backend`，前端只提交声明式 workflow 输入。
- 建立 `Tauri + Node sidecar + Python FastAPI` 的正式桌面主线。
- 引入 `packages/contracts`、`packages/contracts-manifest`、`packages/sdk-core`、`packages/sdk-runtime` 组成的统一契约层。
- Host UI 接入全局浅色 / 深色主题切换。
- macOS 安装包支持独立的 `arm64` 与 `x64` 目标构建。

### Changed
- 桌面宿主正式切换到 `src-tauri/`、`frontend/tauri/` 与 `frontend/sidecar/` 这条运行链。
- 文档入口重组为 `docs/kernel-development/` 与 `docs/plugin-development/` 两块主入口。
- 打包链改为 `renderer + sidecar + runtime resources + tauri bundle` 三段式构建。
- sidecar 内置 Node 改为按目标架构裁剪并去符号，安装包资源只携带运行时必需内容。

### Fixed
- 修复 Tauri 主线下 workflow definition / allowedCapabilities 宿主装配缺失问题。
- 修复 import / export workflow 的输入命名与 payload 对齐问题。
- 修复 workflow 页面下拉、文件夹选择、导入扫描与列表样式不一致问题。
- 修复启动 splash 与主窗口白屏感知问题。
- 修复打包态下后端、插件和 automation 资源路径定位。
- 修复 macOS 图标打包输入，统一到新的 PNG -> icns 资源链路。

### Docs
- 重写并同步 `README.md`、`docs/releases/v0.3.0-alpha.1-release.md` 与开发文档索引，使文档描述与当前 Tauri 主线一致。

## [0.2.2] - 2026-03-15

### Added
- Settings `General` section now includes a GitHub Release based update checker (`Check for Updates`) with direct release-page opening.
- Import track list now supports keyboard-aware multi-row editing (`single/cmd/shift` selection).

### Changed
- App version display now reports Presto version (`frontend/package.json`) in development mode instead of Electron runtime version.
- Update check now supports compatibility fallback: if `app:get-latest-release` IPC is unavailable in older Electron runtime, it falls back to HTTP/fetch release lookup.
- Category edits from one import row can be applied to all selected rows in track list editing.
- Runtime logging is standardized across Electron/import/export paths with improved schema consistency and noisy-log reduction.
- Bumped frontend app version to `0.2.2` for release packaging.

### Docs
- Updated release artifact naming examples in `README.md` to `0.2.2`.
- Updated technical architecture document to include update-check flow, track-list editing behavior, logging standardization, and architecture doc version marker `v0.2.2`.

## [0.2.1] - 2026-03-14

### Fixed
- `Open Strip Silence` action no longer requires pre-selected tracks; opening the Strip Silence window now works as a pure window-open step.
- Improved frontend error normalization for Electron IPC-wrapped backend errors, so structured API errors (for example `NO_TRACK_SELECTED`) no longer degrade to `UNEXPECTED_ERROR`.

### Changed
- Bumped frontend app version to `0.2.1` for release packaging.

## [0.2.0] - 2026-03-14

### Added
- Global Settings page and Developer Mode gating flow.
- Dedicated Developer page with backend diagnostics, logs export, and error tester.
- Unified friendly error system (localized) for import/export flows.
- Mobile QR read-only export progress page with LAN access and temporary session link.
- Export progress ETA smoothing and mobile ETA/estimated-finish display.

### Changed
- Runtime backend supervision and mode switching behavior were hardened.
- Import pipeline reliability and large-session throughput were improved.
- Export/import task progress semantics were aligned (status, ETA, cancellation).
- Packaging switched to `asar` and frontend runtime payload was reduced.

### Fixed
- Strip Silence execution ordering regressions in import runtime.
- Pro Tools version guard messaging and retry flow consistency.
- Mobile QR host detection for LAN routing on multi-interface machines.
- ETA display behavior on first snapshot (show calculating state).

### Docs
- Added phase plans and rollout notes under `docs/plans/`.
- Added v0.2.0 release prep docs and release copy template.
