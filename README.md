# Presto

Presto is a macOS Pro Tools assistant.

Current active backend is **Track2Do backend** (`track2do_backend/`).
It now serves both export routes and merged import routes (`/api/v1/import/*`).

## Requirements

- macOS
- Pro Tools `2023.3+` (English UI)
- Python `3.9+`
- Node.js `18+`

## Quick Start

1. Install dependencies:

```bash
./packaging/install_deps.sh
```

2. Start desktop app:

```bash
npm --prefix web run dev
```

This starts:

- Vite renderer
- Electron shell
- Local Python API (`track2do_backend/main.py`) spawned by Electron

## Development Commands

```bash
# Type check frontend
npm --prefix web run typecheck

# Build frontend
npm --prefix web run build

# Run Track2Do backend only (for debugging)
HOST=127.0.0.1 PORT=8000 DEBUG=false python3 track2do_backend/main.py
```

## Project Structure

- `track2do_backend/`: active Python backend (export + merged import APIs)
- `web/`: Electron + React + Vite frontend
- `presto/`: legacy non-export modules still kept in repo
- `packaging/`: install/build scripts

## Runtime Data (Default)

- `logs/app.log`
- `output/`
- `temp/`

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT License. See [LICENSE](LICENSE).
