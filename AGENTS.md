# Useful Commands

- **Before handoff**: `pnpm check:changed --maxWorkers=2` (format, lint, typecheck, affected tests, ratchets; cached when nothing changed)
- **Typecheck**: `pnpm tc` (or `tc:node` / `tc:cli` / `tc:web`)
- **Test**: `pnpm test [path/to/file.test.ts]`; affected only: `pnpm test:changed [path] --maxWorkers=2` ([details](.github/CONTRIBUTING.md#targeting-local-tests))
- **Lint**: `oxlint`; format: `pnpm format`

# Design System

Deck agent launch changes must preserve the user choices in [DECK_AGENT_UX.md](DECK_AGENT_UX.md).

## Preserve Customizations Across Updates

- CLI and Orca upgrades must preserve the accepted Lamng UI and Claude/Codex account/context display documented in [ORCA_UI_HANDOFF.md](ORCA_UI_HANDOFF.md). Do not silently reset these customizations.
- Keep Claude statusline scripts and configuration outside CLI installation directories. Restore missing managed-account statuslines through the existing launch synchronization; preserve explicit custom commands and `null` settings.
- Preserve Codex's native model/context statusline and Orca's pane footer (`account` + `ctx xx%`). The account must remain bound to that terminal session; unavailable context must show `—`, never a guessed value.
- The terminal workbench has no entry animation (2026-10-24): no opacity fade, translate or scale on the surface that holds the xterm canvases — an opacity animation there re-composited every canvas and hitched when a new CLI started painting. Keep the pixel grid stationary, preserve the approved Lamng signature vector, and run `tests/e2e/deck-terminal-startup-stability.spec.ts` when touching that surface.
- Before installing an upgraded build, run the relevant regression checks and hidden UI checks. If an upstream change breaks the display, adapt the integration before replacing the working build; never change authentication, default models, or provider settings to repair it.
- Upstream updates: merge each new `stablyai/orca` release tag in a separate worktree, resolve conflicts by intent, then require `tc`, related unit tests and every `tests/e2e/deck-*.spec.ts` green before a side-by-side install and hidden smoke. Switch the launcher only after the user approves. `config/scripts/lamng-upstream-check.sh` (daily systemd user timer) reports new tags and previews conflicts; it never merges or installs.

All UI work — layout, color, typography, spacing, component selection, UX behavior — must follow [`docs/STYLEGUIDE.md`](./docs/STYLEGUIDE.md). Use the tokens defined in `src/renderer/src/assets/main.css` (the canonical source) and the shadcn primitives in `src/renderer/src/components/ui/`. Don't invent new color values, font sizes, or shadow tiers when a documented one already covers the role. Read the `docs/styleguide/` deep dive it links only when your change touches that topic. When STYLEGUIDE.md is silent, follow the resolution order in its final section.

# Electron UI Validation

Always run tests and agent-launched apps in the background with `ORCA_BACKGROUND_LAUNCH=1`.
Never steal monitor focus or reveal test windows: no `show()`, `showInactive()`, `bringToFront()`,
`app.focus()`, or OS activation. Use CDP screenshots of hidden renderers. Keep native-focus and visible-window tests paused on the user's desktop; run them on an isolated display or CI.
Rebuild modified launch-policy code before running an app; stale build wrappers are not safe.

Use the `$electron` skill and Playwright CDP for rendered Orca UI checks. Do not use computer-use for Orca UI validation.
Screenshot presentational components without Electron: `pnpm fixtures:shot <id>` ([fixtures](docs/agents-md-refs/component-fixtures.md)).

# Code Style

## Reuse Before Reimplementing

Before writing new logic at any scale — a function, component, IPC channel, state store, or whole subsystem/flow — check whether an existing implementation already does the job. Extend or generalize it instead of building a parallel version.

## Avoid Comments

- Only use when code does not describe
- BE CONCISE. 1 LINE if possible (why not how)

## File and Module Naming

Never use vague names like `helpers`, `utils`, `common`, `misc`, or `shared-stuff` for files, folders, or modules. They carry zero info and tend to become dumping grounds. Name files after what they _actually_ contain — prefer the concrete domain concept (e.g. `tab-group-state.ts`, `terminal-orphan-cleanup.ts`) over the generic role (`tabs-helpers.ts`, `terminal-utils.ts`). If you find yourself reaching for `helpers`, the file probably has more than one responsibility and should be split, or there's a better name hiding in the code that describes what the functions operate on.

## Type Assertions: Prefer Checked Types

Avoid type assertions except `as const`. Unavoidable casts need a line-specific `SAFETY:` explanation:

# First Class Citizens

Every change must consider these areas:

## Cross-Platform Support

Support macOS, Linux, and Windows. Guard platform-specific behavior at runtime; use platform-aware shortcuts, paths, and existing process wrappers. Before changing platform-specific code, processes, shells, shortcuts, paths, or native modules, read [`docs/agents-md-refs/cross-platform-support.md`](./docs/agents-md-refs/cross-platform-support.md).

## Remote Use Case

Support remote execution as well as local. Clients and servers update independently; preserve compatibility across mixed versions.

## Mobile

Any feature should be considered for parity on mobile

## Folder Workspaces

All changes must consider folder workspaces as well as git worktrees. Don't assume every workspace is a git worktree.

# Git / GitHub

If changing code around `git`, `gh`, source-control, or review behavior read [`docs/agents-md-refs/git-workflow.md`](./docs/agents-md-refs/git-workflow.md).

For a failed GitHub Actions run, inspect the failed jobs and retry with `gh run rerun <run-id> --failed --repo stablyai/orca`. Preserve successful jobs; use a full rerun only when the failure requires revalidating them. A code fix needs a new push and fresh checks, not a retry of the old SHA.

# Tests

Avoid adding low-value tests. These might be fine for development but offer negative value when checked in. [Anti-patterns](./docs/agents-md-refs/test-antipatterns.md)
