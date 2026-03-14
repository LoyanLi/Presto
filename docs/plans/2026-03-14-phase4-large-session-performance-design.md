# Presto Phase 4 Large-Session Performance Design

## Context
- Target user confirmed: regular musicians.
- Confirmed optimization target:
  - Scenario: `100-200 tracks`
  - Primary KPI: total runtime throughput (`~40%` faster vs current baseline)
  - Constraint: Pro Tools UI actions stay serial (no PT parallel automation).

## Baseline Bottlenecks
- Import runtime currently processes every track as a full serial chain in one loop:
  - `import -> rename -> select -> color -> select clips -> strip silence`.
- `import_audio_file()` internally does per-track track-list diff (`before/after`) and triggers repeated list calls.
- Coloring currently performs one command per track, even when many tracks share the same color slot.
- Progress model only exposes flat percent + current item; no phase/stage granularity for diagnostics.

## Approaches Considered
1. Reduce PT round-trips + staged batching (recommended)
2. Multi-file import batching in single PT command (higher risk mapping ambiguity)
3. Full execution engine / queue architecture (better long-term, too large for Phase 4)

## Chosen Architecture (Approach 1)
### 1) Staged serial pipeline
- Keep PT operations serial, but split orchestration into explicit stages:
  - `stage_import_rename`
  - `stage_color_batch`
  - `stage_strip_silence`
- Each stage emits structured progress events.

### 2) Gateway round-trip reduction
- Add incremental import helper to avoid redundant full list scans per track.
- Add batch color API:
  - group tracks by slot
  - call SetTrackColor once per slot group (`slot -> [track_names...]`).

### 3) Orchestrator pre-compilation
- Pre-build executable work items from resolved input and category map before touching PT.
- Skip invalid items early and avoid entering PT command path for guaranteed failures.

### 4) Progress schema upgrade
- Extend import run state with:
  - `stage`
  - `stage_current`
  - `stage_total`
  - `stage_progress`
  - optional `eta_seconds`
- Keep existing `progress/current_index/total/current_name` for backward compatibility.

### 5) UI rendering strategy
- Import page keeps 1s poll cadence but renders stage-aware status:
  - `Importing / Coloring / StripSilence`.
- Show per-stage progress so bottlenecks are visible during large runs.

## Error Handling
- Preserve current fail-safe behavior:
  - single-track errors remain isolated.
  - run completes with `completed_with_errors` when partial failure occurs.
- Batch color fallback:
  - if grouped color call fails for a slot, fallback to per-track color for that slot group, then continue.

## Testing Strategy
- Unit / integration:
  - gateway: batch color grouping behavior + fallback behavior.
  - orchestrator: stage order, stage progress monotonicity, result consistency.
  - import route: extended run-state fields are returned and stable.
- Frontend:
  - type checks for extended `ImportRunState`.
  - stage UI rendering smoke check.

## Benchmark Plan
- Fixed sample sets: 100 / 150 / 200 tracks.
- Record:
  - total runtime
  - stage runtime breakdown
  - failure count
- Acceptance gate:
  - `P50` total runtime improves by `>=40%` in 100-200 track scenario
  - failure rate does not regress.

## Out of Scope
- PT UI parallel execution.
- Persistent cross-session queueing (belongs to Phase 6).
- Export path optimization (Phase 4 import-focused).
