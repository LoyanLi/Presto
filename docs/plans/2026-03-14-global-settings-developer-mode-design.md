# Presto Global Settings + Developer Mode Design

## Context
Presto is shifting toward regular musicians as primary users. Developer-facing controls (logs, port, backend lifecycle) should not be visible by default.

## Goals
- Add a dedicated global settings page as the central place for app settings.
- Move developer controls out of Home into a standalone Developer page.
- Gate developer controls behind an explicit user confirmation toggle.
- Keep Import workflow shortcuts for AI/Categories, but route users to global settings sections.

## Confirmed Product Decisions
1. Home should not contain any developer diagnostics.
2. Developer area must be a separate page.
3. Developer entry is hidden until user enables Developer Mode.
4. Enabling Developer Mode requires explicit confirmation.
5. Import keeps shortcut buttons, but settings authority belongs to Global Settings.

## Information Architecture
- Views:
  - `home`
  - `import`
  - `export`
  - `settings`
  - `developer` (conditional)
- Settings sections:
  - General
  - AI Settings
  - Categories
  - Developer Mode

## UX Rules
- Default: Developer Mode OFF.
- OFF -> ON transition: show confirmation prompt.
- If canceled: keep OFF.
- If ON:
  - show Developer navigation entry
  - allow access to Developer page
- If OFF and user tries to access Developer page: redirect to Settings + message.

## Technical Design
### Backend
- Extend `UiPreferences` with `developer_mode_enabled: bool = False`.
- Persist this flag in config store migration path and API schemas.

### Frontend
- Add `settings` + `developer` views in app shell routing.
- New Settings page:
  - Manage general preferences
  - Open/edit AI & Categories from global settings
  - Manage Developer Mode toggle with confirmation
- New Developer page:
  - Move existing backend diagnostics panel from Home
  - includes status, port updates, restart, log stream/export
- Import shortcuts:
  - AI/Categories buttons navigate to Settings target section.

## Security / Safety Guardrails
- Developer controls hidden by UI when mode is OFF.
- Developer actions should be blocked if route is forced while OFF.

## Out of Scope
- Permission/auth system
- Theme redesign beyond this feature
- Changes to import/export processing logic

## Validation Plan
- Backend config migration tests for new preference field.
- Frontend typecheck.
- Manual validation:
  1. Fresh launch: no developer area on Home.
  2. Enable developer mode with confirm -> Developer page visible.
  3. Cancel confirm -> mode remains OFF.
  4. Disable mode -> Developer entry disappears.
