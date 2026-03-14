---
name: presto-release-prep
description: Prepare Presto release artifacts, changelog, screenshots checklist, release copy, commit summary, and tag operations.
---

# Presto Release Prep Skill

## Scope

Use this skill when preparing a release branch for publishing.

## Checklist

1. Confirm target version in `frontend/package.json` and `frontend/package-lock.json`.
2. Update `CHANGELOG.md` for the target version.
3. Update `docs/releases/<version>-release.md`:
   - user-facing highlights
   - installer paths
   - screenshot checklist
   - release copy (short + standard)
   - pre-push commit list
4. Ensure process files are ignored by `.gitignore`:
   - `task_plan.md`
   - `findings.md`
   - `progress.md`
   - `docs/plans/`
5. Build installers:
   - `npm --prefix frontend run package:mac:installer:arm64`
   - `npm --prefix frontend run package:mac:installer:x64`
6. Verify artifact names contain target version.
7. Stage and commit release-prep changes.
8. Create annotated tag:
   - `git tag -a vX.Y.Z -m "Release vX.Y.Z"`
9. Final verification:
   - `git status --short`
   - `git log --oneline --decorate --reverse origin/main..HEAD`
   - `git show vX.Y.Z --no-patch --decorate`

## Notes

- On Apple Silicon, if x64 build fails with missing `Electron` binary, clear or replace corrupted cached Electron x64 zip and retry.
- Prefer publishing arm64 and x64 as separate downloads.
- Keep release copy synchronized with changelog highlights.

