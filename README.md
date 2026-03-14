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
- API entry based backend modularization for future expansion

## Runtime Architecture

At runtime, the desktop app starts two Python API services:

- `backend/export` on `127.0.0.1:8000` (export/session/transport/connection APIs)
- `backend/import` (runs `presto.main_api`) on `127.0.0.1:8001` (import/config/AI naming APIs)

The renderer sends HTTP requests to `http://127.0.0.1:8000`. Electron main process routes requests by API entry rules:

- `import` routes are forwarded to port `8001`
- `export` routes stay on port `8000`

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
- `backend/export/main.py` (`8000`)
- `python3 -m presto.main_api` from `backend/import/` (`8001`)

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

Output directory:

- `frontend/release/`

App icon:

- Source: `assets/App.icon`
- Synced to build resources by `npm --prefix frontend run sync:icon`
- Build setting: `frontend/package.json` -> `build.mac.icon = build/App.icon`

## API Entry Mapping

| Frontend Entry | Frontend Module | Backend Service | Default Port | Route Examples |
| --- | --- | --- | --- | --- |
| `import` | `frontend/src/services/api/import.ts` | `backend/import/presto/main_api.py` | `8001` | `/api/v1/import/*`, `/api/v1/config`, `/api/v1/ai/key/*` |
| `export` | `frontend/src/features/export/track2do/services/api/*` | `backend/export/main.py` | `8000` | `/api/v1/export/*`, `/api/v1/session/*`, `/api/v1/tracks` |

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

- One of the local Python services failed to start
- Temporary startup race during Electron boot
- Port conflicts (`8000` or `8001`)

Checks:

1. Restart app (`npm --prefix frontend run dev`)
2. Verify logs printed by Electron for both Python services
3. Ensure ports are free and Pro Tools is available

## Open Source and Contribution

- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Technical internals: [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md)
- Changelog: [CHANGELOG.md](CHANGELOG.md)
- Release notes template: [docs/releases/v0.2.0-release.md](docs/releases/v0.2.0-release.md)

## License

MIT. See [LICENSE](LICENSE).
