# Presto

Presto is a macOS desktop assistant for Pro Tools workflows.
It combines an Electron + React UI with local Python services for import/export automation.

## Highlights

- Import + Export workflows in one app
- AI-assisted import naming and batch automation
- Keyboard multi-select editing in import track list (`single/cmd/shift`)
- Mobile read-only export progress via local QR link
- Localized friendly errors (English + Simplified Chinese)
- Local-first runtime with on-demand backend mode switching

## Requirements

- macOS
- Pro Tools `2023.3+` (English UI recommended)
- Python `3.9+`
- Node.js `18+`

## Quick Start

```bash
./packaging/install_deps.sh
npm --prefix frontend run dev
```

## Common Commands

```bash
# Frontend
npm --prefix frontend run typecheck
npm --prefix frontend run build

# Backend tests (quick set)
pytest -q backend/tests/test_ai_rename_service.py backend/tests/test_config_store.py

# Package macOS installers (arm64 + x64)
npm --prefix frontend run package:mac:installer
```

Current artifact naming:

- `frontend/release/Presto-0.2.2-arm64.dmg`
- `frontend/release/Presto-0.2.2-x64.dmg`

## Signing and macOS Install

Current build command uses unsigned packaging (`-c.mac.identity=null`).
If Gatekeeper blocks first launch:

1. Open DMG and drag Presto to `Applications`
2. In `Applications`, right-click `Presto.app` and choose `Open`
3. Click `Open` in warning dialog
4. If still blocked: `System Settings -> Privacy & Security -> Open Anyway`

Advanced terminal option:

```bash
xattr -dr com.apple.quarantine /Applications/Presto.app
```

## In-App Update Check

In `Settings -> General`, click `Check for Updates`.
Release source: `https://api.github.com/repos/LoyanLi/Presto/releases/latest`

## Docs

- [Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md)
- [Contributing Guide](CONTRIBUTING.md)
- [Changelog](CHANGELOG.md)

## License

MIT. See [LICENSE](LICENSE).
