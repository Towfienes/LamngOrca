# Orca 1.4.220 — Deck UI installed and verified

Orca on this machine now opens the full Deck renderer from
`~/Applications/Orca-1.4.220-Deck-Complete/AppRun`. Quit Orca and reopen it from
the application menu to load the new renderer. The previous running instance
was left running; the installer does not close active terminals.

## Included

The integration carries all 40 files from Deck commit `f91a89b0`, adapted to
release `v1.4.220`: sidebar actions and agent rows, tab surfaces and breadcrumb,
pane headers and selection borders, and Agent splitting into the hovered pane.

The renderer imports Deck appearance once per Orca profile: sidebar tint,
full agent rows, sidebar widths, zoom, terminal theme and inactive pane opacity,
and automatic tab titles. Later preference changes survive restart. Import
completion is recorded only after both settings and UI saves succeed.

Only appearance is imported. Orca keeps its existing accounts, projects,
workspace sessions and terminal layouts. The Deck profile is not copied.
The editor tab close button stays reachable by keyboard while the file is dirty.

## Verification

- Renderer TypeScript check passed.
- 34 focused unit/component tests passed across 7 files, including profile
  separation, retry after a failed appearance save and preservation of later edits.
- Five Deck Electron checks passed: agent tiling, four-pane sidebar/navigation,
  light/dark tabs and overflow, drag/pin controls, and editor/browser keyboard controls.
- Changed-code quality gate passed with `ORCA_CODE_QUALITY_BASE=v1.4.220`.
- Full E2E and production builds passed, including the daemon load guard.
- Packaged application smoke passed with a disposable profile and isolated home:
  hidden windows, Deck controls, appearance import and restart persistence.
- All 3,839 original files outside the renderer retain their bytes, executable
  flags and unpacking flags. All 1,146 renderer files match the production build.
- Installed archive hash matches `dist/orca-deck-complete/verification.json`.

Tests run with `ORCA_BACKGROUND_LAUNCH=1` and CDP. No native-focus tests,
full repository suite, macOS/Windows execution or live SSH session were run.

## Package and rollback

The verified package and one-off installer are in `dist/orca-deck-complete/`.
The installer has already run. The original AppImage and previous Deck runtime
remain available. No automatic updater was added; an official update or
reinstallation can replace the local customization.

To restore the previous Orca launcher, run:

```sh
cp -- "$HOME/Applications/Orca-1.4.220-Deck-Complete/original-orca.desktop" \
  "$HOME/.local/share/applications/appimagekit_ae11192f5fe223a1e05f0008606929e5-Orca.desktop"
```

Appearance fields before synchronization are saved in
`dist/deck-ui-settings-backup-20261013-081631/appearance-before.json`.
The working diff and Git index before completing integration are backed up in
`dist/deck-integration-backup-20261013-081257/`.
