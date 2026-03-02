# Contributing to Presto

Thanks for contributing.

## Prerequisites

- macOS
- Python `3.9+`
- Node.js `18+`
- Pro Tools `2023.3+` (English UI) for automation/E2E validation

## Setup

1. Install all deps:

```bash
./packaging/install_deps.sh
```

2. Start app in development mode:

```bash
npm --prefix web run dev
```

## Project Areas

- `presto/`: Python business logic, orchestration, API bridge
- `web/`: Electron + React UI
- `tests/`: Python tests

## Coding Guidelines

- Keep changes minimal and scoped.
- Do not commit generated folders (`web/node_modules`, `web/dist`).
- Keep Web and Python behavior aligned with existing workflows.
- Prefer explicit error codes/messages for automation failures.

## Testing Checklist

Before submitting:

```bash
npm --prefix web run typecheck
npm --prefix web run build
```

Also run relevant Python tests when touching backend logic.

## Commit Style

Use concise, scoped commit messages, e.g.:

- `feat(import): support recursive folder scan`
- `fix(ui): prevent analyze render crash`
- `docs: update setup and license`

## Pull Request Notes

Include:

- What changed
- Why it changed
- How to verify
- Any known limitations

For UI changes, include screenshots or short screen recordings when possible.
