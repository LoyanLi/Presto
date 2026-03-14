# Presto

Presto is a macOS desktop assistant for Pro Tools workflows.
It combines an Electron + React UI with local Python services for:

- Track2Do export workflow automation
- AI-assisted import naming and import automation
- Session and track utility operations

## Highlights

- Local-first architecture (no mandatory cloud backend)
- Pro Tools focused workflows with PTSL + UI automation
- Import and export capabilities in one desktop app
- Single active-backend runtime with request-driven mode switching
- Global settings + guarded developer mode for safer default UX
- Category Editor JSON import/export
- Mobile QR read-only export progress tracking on local network
- Localized friendly error messages (English + Simplified Chinese)

## Runtime Architecture

At runtime, the desktop app runs one active Python backend mode at a time (`export` or `import`).

- Electron main (`frontend/electron/main.mjs`) acts as a backend manager.
- Renderer sends requests through Electron IPC using `http://127.0.0.1:8000` as gateway URL.
- Electron infers target mode from route path and auto-activates the required backend process on demand.
- Runtime port defaults to `8000`, and auto-scans to a nearby available port when occupied.

See [Technical Architecture](docs/TECHNICAL_ARCHITECTURE.md) for details.

## Requirements

- macOS
- Pro Tools `2023.3+` (English UI recommended for automation stability)
- Python `3.9+`
- Node.js `18+`

## Quick Start

1. Install dependencies:

```bash
./packaging/install_deps.sh
```

2. Start development app:

```bash
npm --prefix frontend run dev
```

This starts:

- Vite renderer (`5173`)
- Electron shell
- Backend manager in Electron (`frontend/electron/main.mjs`)
- On-demand Python backend mode (`export` or `import`) on local runtime port

## Development Commands

```bash
# Frontend type check
npm --prefix frontend run typecheck

# Frontend production build
npm --prefix frontend run build

# Python tests (recommended quick set)
pytest -q backend/tests/test_ai_rename_service.py backend/tests/test_config_store.py

# Run export backend only
HOST=127.0.0.1 PORT=8000 python3 backend/export/main.py

# Run import backend only
cd backend/import && python3 -m presto.main_api --host 127.0.0.1 --port 8001
```

## Behavior Notes

- Settings is now a dedicated global page with sections: `General`, `AI Settings`, `Developer Mode`.
- Developer entry is hidden until Developer Mode is explicitly enabled with a confirmation prompt.
- Developer page contains backend diagnostics, shared-port update, backend restart, log export, and error tester.
- Category Editor supports JSON import/export for category templates.
- Import automation supports category-batch import with per-file fallback retry on track-detection mismatch.
- Strip Silence open action does not toggle-close an already opened Strip Silence window.
- Export progress includes ETA and a mobile read-only progress link/QR popover.

## Build macOS Installer

One-click (double click in Finder):

- `package_installer.command`

Terminal command:

```bash
./package_installer.command
```

Direct npm command:

```bash
npm --prefix frontend run package:mac:installer
```

This command now builds both macOS architectures:

- Apple Silicon (`arm64`)
- Intel (`x64`)

Single-arch commands:

```bash
npm --prefix frontend run package:mac:installer:arm64
npm --prefix frontend run package:mac:installer:x64
```

Recommended release strategy: publish single-arch installers separately to reduce total distribution size.

Current versioned artifact naming example:

- `frontend/release/Presto-0.2.0-arm64.dmg`
- `frontend/release/Presto-0.2.0-x64.dmg`

Output directory:

- `frontend/release/`

App icon:

- Source: `assets/App.icon`
- Synced to build resources by `npm --prefix frontend run sync:icon`
- Build setting: `frontend/package.json` -> `build.mac.icon = build/App.icon`

## API Entry Mapping

| Frontend Entry | Frontend Module | Backend Service | Default Port | Route Examples |
| --- | --- | --- | --- | --- |
| `import` | `frontend/src/services/api/import.ts` | `backend/import/presto/main_api.py` (activated on demand) | Shared runtime port (`8000` by default) | `/api/v1/import/*`, `/api/v1/config`, `/api/v1/ai/key/*` |
| `export` | `frontend/src/features/export/track2do/services/api/*` | `backend/export/main.py` (activated on demand) | Shared runtime port (`8000` by default) | `/api/v1/export/*`, `/api/v1/session/*`, `/api/v1/tracks` |

## Repository Layout

```text
.
├── frontend/                # Electron + React frontend
├── backend/                 # Python backend workspace
│   ├── export/              # Export/session backend (FastAPI)
│   ├── import/              # Import backend workspace
│   │   └── presto/          # Import/config backend + domain services (Python package)
│   ├── tests/               # Python tests
│   └── requirements.txt     # Shared backend dependencies
├── assets/                  # Icon and shared static assets
├── packaging/               # Setup and packaging scripts
├── .presto/                 # Local app support data in dev (generated)
└── docs/                    # Project documentation
```

## Runtime Data (Generated)

- `.presto/` (import backend config/logs in dev mode)
- `backend/export/logs/`, `backend/export/output/`, `backend/export/temp/` (export backend runtime artifacts)
- `.presto_ai_analyze.json` in selected source folders (cached import AI analysis)

## Troubleshooting

### `Error occurred in handler for 'http:get': TypeError: fetch failed`

Common causes:

- Active backend mode is still starting or restarting
- Runtime port was reassigned due port conflict and backend is not ready yet
- Pro Tools/automation prerequisite is missing for the requested route

Checks:

1. Restart app (`npm --prefix frontend run dev`)
2. Open `Settings -> Developer Mode -> Developer Page` and inspect backend diagnostics/logs
3. Ensure ports are free and Pro Tools is available

### `ENOENT .../release/mac/Electron.app/Contents/MacOS/Electron` during x64 packaging

This usually means local cached Electron x64 zip is corrupted.

Fix:

1. Move/remove local cache file:
   - `~/Library/Caches/electron/electron-v<version>-darwin-x64.zip`
2. Re-run:
   - `npm --prefix frontend run package:mac:installer:x64`

## Open Source and Contribution

- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Technical internals (local maintainer doc): `docs/TECHNICAL_ARCHITECTURE.md`
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- Release notes template (local): `docs/releases/v0.2.0-release.md`

## License

MIT. See [LICENSE](LICENSE).
