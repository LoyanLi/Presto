# Presto

Presto is a macOS Pro Tools assistant for import/export automation.

Core workflows:

- `Import`: folder scan, optional AI naming, category color mapping, Strip Silence assisted flow.
- `Export`: 3-step snapshot-based export workflow.

Current app entries:

- `Web/Electron` (only frontend)

## Requirements

- macOS
- Pro Tools `2023.3+` (English UI)
- Python `3.9+`
- Node.js `18+`

## Quick Start

1. Install Python dependencies:

```bash
python3 -m pip install -r requirements.txt
```

2. Install web dependencies:

```bash
npm --prefix web install
```

3. Start desktop app (recommended):

```bash
npm --prefix web run dev
```

This starts:

- Vite renderer
- Electron shell
- Local Python API (`presto.main_api`) spawned by Electron

## Development Commands

```bash
# Type check frontend
npm --prefix web run typecheck

# Build frontend
npm --prefix web run build

# Run API only (for debugging)
python3 -m presto.main_api --host 127.0.0.1 --port 8000
```

## Project Structure

- `presto/`: Python core logic (domain, orchestrators, infra, web_api)
- `web/`: Electron + React + Vite frontend
- `tests/`: Python tests
- `packaging/`: packaging scripts

## Data Paths

- App config: `~/Library/Application Support/Presto/config.json`
- Logs: `~/Library/Application Support/Presto/logs/`
- Export snapshots: `<SessionDir>/snapshots/snapshots.json`
- Export presets: `~/Documents/Tracktodo/presets.json`
- AI key: macOS Keychain

## Permissions

For UI automation to work:

- Grant macOS Accessibility permission to your host app/terminal.
- Keep Pro Tools frontmost and in English UI.

## Troubleshooting

1. Automation menu/control not found
- Verify Pro Tools language and version first.

## Contributing

Please read [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT License. See [LICENSE](LICENSE).
