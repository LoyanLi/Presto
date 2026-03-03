# Contributing to Presto

Thank you for improving Presto.
This guide focuses on practical contribution workflow, quality gates, and compatibility expectations.

## 1. Prerequisites

- macOS
- Python `3.9+`
- Node.js `18+`
- Pro Tools `2023.3+` for end-to-end automation validation

## 2. Local Setup

```bash
./packaging/install_deps.sh
npm --prefix web run dev
```

Recommended shell setup:

```bash
source .venv/bin/activate
```

## 3. Project Areas

- `web/`: Electron + React UI and client API modules
- `track2do_backend/`: export/session FastAPI backend
- `presto/`: import/config FastAPI backend and domain logic
- `tests/`: Python unit/integration tests

## 4. Compatibility Rules

When making changes, preserve these contracts unless the change explicitly includes migration work:

- Keep `/api/v1/*` route contracts backward compatible
- Keep Electron route mapping aligned with frontend API entries
- Keep import/export workflow behavior stable by default
- Keep generated artifacts and local runtime files out of git

## 5. Branch and Commit Conventions

- Use short, scoped commits
- Prefer conventional prefixes: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

Examples:

- `fix(import): keep analyze order consistent with display order`
- `refactor(api): register backend routes by frontend entry`
- `docs: add architecture and contribution guidelines`

## 6. Development Checklist

Run at least:

```bash
npm --prefix web run typecheck
pytest -q tests/test_ai_rename_service.py tests/test_config_store.py
```

When touching orchestration/import flow, also run:

```bash
pytest -q tests/test_orchestrator_integration.py
```

When touching Electron runtime routing, also verify:

```bash
node --check web/electron/main.mjs
```

## 7. Pull Request Checklist

Include in every PR:

- Summary of what changed
- Why the change is needed
- How to verify (exact commands)
- Risks and rollback notes
- Screenshots or short recording for UI changes

## 8. Coding Expectations

- Keep changes focused and minimal
- Prefer explicit error codes and actionable error messages
- Add tests for non-trivial logic changes
- Update docs when behavior, routes, or architecture changes

## 9. Documentation Requirements

Update related docs when applicable:

- `README.md` for setup, behavior, or command changes
- `docs/TECHNICAL_ARCHITECTURE.md` for module/flow/interface changes
- `CONTRIBUTING.md` if workflow expectations change

## 10. Security and Local Data

- Never commit API keys, tokens, or local secrets
- Do not commit runtime caches/logs/output
- Validate `.gitignore` coverage when adding new generated files

## 11. Reporting Bugs and Proposing Features

For bug reports, include:

- Reproduction steps
- Expected vs actual behavior
- Logs or stack traces
- Environment details (macOS, Pro Tools version, commit hash)

For feature proposals, include:

- Problem statement
- Proposed API/UI changes
- Compatibility impact
- Test plan
