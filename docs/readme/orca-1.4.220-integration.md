# Orca 1.4.220 — Deck UI installed and verified

Orca on this machine now opens the full Deck renderer from
`~/Applications/Orca-1.4.220-Deck-Seamless/AppRun`. Quit Orca and reopen it from
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
- Installed archive hash matches `dist/orca-deck-seamless/verification.json`.

Tests run with `ORCA_BACKGROUND_LAUNCH=1` and CDP. No native-focus tests,
full repository suite, macOS/Windows execution or live SSH session were run.

## Package and rollback

The verified package and one-off installer are in `dist/orca-deck-seamless/`.
The installer has already run. The original AppImage and previous Deck runtime
remain available. No automatic updater was added; an official update or
reinstallation can replace the local customization.

To restore the previous Orca launcher, run:

```sh
cp -- "$HOME/Applications/Orca-1.4.220-Deck-Seamless/original-orca.desktop" \
  "$HOME/.local/share/applications/appimagekit_ae11192f5fe223a1e05f0008606929e5-Orca.desktop"
```

Appearance fields before synchronization are saved in
`dist/deck-ui-settings-backup-20261013-081631/appearance-before.json`.
The working diff and Git index before completing integration are backed up in
`dist/deck-integration-backup-20261013-081257/`.

## Sidebar refinement

Agent provider icons are centered across both text lines. A small round status
badge overlaps the lower left edge; waiting uses an amber dot, and working
provider icons rotate. Reduced motion disables rotation. Agent rows retain
keyboard navigation and the selected row's contrasting surface.

Clicking a sidebar workspace with no tabs opens the existing Agent picker,
with an explicit Blank terminal choice. Cancelling leaves the workspace empty;
clicking a workspace with an existing editor, browser, agent or terminal tab
returns to that content. Both git worktrees and folder workspaces follow this
flow. Agent recovery and host inventory finish before an empty-workspace menu
opens, and local/paired-client background seeders respect its empty tab group.

This refinement passed renderer typecheck, the changed-code quality gate,
focused unit checks (including remote inventory and retry cases), four Electron
checks covering the sidebar, agent tiling and both workspace kinds, and a
packaged-app launch/cancel/open/restart check with isolated home and profile.

![Compact agent rows and overlapping status badges](../assets/orca-deck-sidebar.png)

## Seamless workspace refinement

Workspace chrome and terminal gutters share the sidebar appearance through the
canonical `workspace-canvas` token. Each terminal sits 6 px inside the workspace
with a rounded hairline border. Idle divider lines recede; hover and drag still
show the resize handle. A 32 px header reserves matching terminal space, and
the active pane keeps the terminal surface while other headers lift subtly.
Tabs use a quiet background without the boxed selection outline.

Project and branch rows now have a 2 px virtual-row gap and 2 px workspace
padding. The virtualizer and drag placement consume the same gap constant.
Appearance preferences and agent/session routing are unchanged.

Validation covers 40 sidebar layout tests, renderer typecheck and changed-code
quality, hidden Electron screenshots across themes and viewport widths, tab
overflow/drag/keyboard controls, agent tiling, folder/worktree launch choices,
and packaged-app restart with an isolated profile. Terminal screen bounds and
header alignment are checked after resizing.

![Seamless workspace with inset terminal cards](../assets/orca-deck-workspace.png)
