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

- `track2do_backend` on `127.0.0.1:8000` (export/session/transport/connection APIs)
- `presto.main_api` on `127.0.0.1:8001` (import/config/AI naming APIs)

The renderer sends HTTP requests to `http://127.0.0.1:8000`. Electron main process routes requests by API entry rules:

- `importApi` routes are forwarded to port `8001`
- `exportApi` routes stay on port `8000`

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
npm --prefix web run dev
```

This starts:

- Vite renderer (`5173`)
- Electron shell
- `track2do_backend/main.py` (`8000`)
- `python3 -m presto.main_api` (`8001`)

## Development Commands

```bash
# Frontend type check
npm --prefix web run typecheck

# Frontend production build
npm --prefix web run build

# Python tests (recommended quick set)
pytest -q tests/test_ai_rename_service.py tests/test_config_store.py

# Run export backend only
HOST=127.0.0.1 PORT=8000 python3 track2do_backend/main.py

# Run import backend only
python3 -m presto.main_api --host 127.0.0.1 --port 8001
```

## API Entry Mapping

| Frontend Entry | Frontend Module | Backend Service | Default Port | Route Examples |
| --- | --- | --- | --- | --- |
| `importApi` | `web/src/services/api/importApi.ts` | `presto/main_api.py` | `8001` | `/api/v1/import/*`, `/api/v1/config`, `/api/v1/ai/key/*` |
| `exportApi` | `web/src/features/export/track2do/services/api/*` | `track2do_backend/main.py` | `8000` | `/api/v1/export/*`, `/api/v1/session/*`, `/api/v1/tracks` |

## Repository Layout

```text
.
├── web/                     # Electron + React frontend
├── track2do_backend/        # Export/session backend (FastAPI)
├── presto/                  # Import/config backend + domain services
├── tests/                   # Python tests
├── packaging/               # Setup and packaging scripts
├── .presto/                 # Local app support data in dev (generated)
└── docs/                    # Project documentation
```

## Runtime Data (Generated)

- `.presto/` (import backend config/logs in dev mode)
- `logs/`, `output/`, `temp/` (export backend runtime artifacts)
- `.presto_ai_analyze.json` in selected source folders (cached import AI analysis)

## Troubleshooting

### `Error occurred in handler for 'http:get': TypeError: fetch failed`

Common causes:

- One of the local Python services failed to start
- Temporary startup race during Electron boot
- Port conflicts (`8000` or `8001`)

Checks:

1. Restart app (`npm --prefix web run dev`)
2. Verify logs printed by Electron for both Python services
3. Ensure ports are free and Pro Tools is available

## Open Source and Contribution

- Contribution guide: [CONTRIBUTING.md](CONTRIBUTING.md)
- Technical internals: [docs/TECHNICAL_ARCHITECTURE.md](docs/TECHNICAL_ARCHITECTURE.md)

## License

MIT. See [LICENSE](LICENSE).
