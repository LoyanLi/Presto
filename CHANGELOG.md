# Changelog

All notable changes to this project are documented in this file.

## [0.3.0-alpha.2] - 2026-03-31

### Added
- 引入以 `packages/contracts`、`packages/contracts-manifest`、`packages/sdk-core`、`packages/sdk-runtime` 为中心的统一契约层，供 Electron 宿主、Python 后端与插件运行时共用。
- 引入正式的官方插件结构与宿主插件运行时，当前仓库已包含 `official.import-workflow`、`official.export-workflow` 与 `official.split-stereo-to-mono-automation`。
- macOS 安装包改为分架构产物，分别输出 `arm64` 与 `x64` 的独立 DMG。

### Changed
- 运行时边界被重整为“桌面宿主 / 本地后端 / 插件扩展”三层模型，能力调用统一经 `/api/v1` 与 capability envelope 进入后端。
- 后端根目录语义收敛为 `backend/presto/`，不再继续挂在失真的 `backend/import/` 路径下。
- 发布打包改为 `asar + maximum compression + minimal file inputs`，并通过 `extraResources/backend` 装配后端资源，减小安装包体积。
- About 面板、应用版本展示与 GitHub Release 元数据读取统一绑定到 `package.json` 中的 Presto 版本信息。

### Fixed
- 修复打包态下后端根路径解析，确保应用从安装包内正确定位 `backend/presto` 资源。
- 修复 macOS 图标打包链路，避免 `.icon` 输入触发 `actool` 资产编译失败。
- 移除 Dock 图标覆写路径，修复应用启动后图标回跳问题。

### Docs
- 重写并同步 `README.md`、前端架构、后端架构、通信架构、SDK 开发与版本支持文档，使文档描述与当前代码边界一致。

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
