# Changelog

All notable changes to this project are documented in this file.

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
