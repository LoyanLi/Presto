## macOS Prebuilt Icon Assets

These files are copied from the old Electron `v0.2.x` Presto release bundles that successfully shipped the Icon Composer app icon.

- `arm64/Assets.car` comes from the old Electron `mac-arm64/Presto.app`.
- `x64/Assets.car` comes from the old Electron `mac/Presto.app`.
- `src-tauri/icons/icon.icns` is kept in sync with the old Electron bundle's `icon.icns`.

The current Tauri release pipeline reuses these final bundle assets directly instead of recompiling `assets/App.icon` on every build.
