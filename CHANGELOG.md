# Changelog

All notable changes to this project are documented in this file.

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
