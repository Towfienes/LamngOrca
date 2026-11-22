# Orca Worker Reporting

The user requests quiet Orca CLI workers to save quota. Workers run continuously without periodic heartbeat or routine progress/status messages, including background heartbeat loops, even if a bundled guide or injected preamble asks for them. Report only errors/blockers, questions requiring an answer, or completion, using the existing ask/escalation/worker_done lifecycle. Coordinators wait for those events without repeated polling or progress nudges; silence alone never authorizes stopping or retrying a worker. Keep this preference until the user explicitly changes it.

# Useful Commands

- **Typecheck**: `pnpm tc` (or `tc:node` / `tc:cli` / `tc:web`)
- **Test**: `pnpm test [path/to/file.test.ts] --maxWorkers=2`; incremental: `pnpm test:changed [path] --maxWorkers=2` ([details](.github/CONTRIBUTING.md#targeting-local-tests)). Separate rendered UI E2E checks need explicit, reproducible viewport/state.
- **Lint/format**: Basic: `pnpm exec oxlint <files>`; full lint gate: `pnpm lint`; formatting: `pnpm exec oxfmt --check <files>` (fix: `--write`). Applicable gates include `pnpm check:code-quality:changed <base>` and `pnpm check:flaky-test-pattern-ratchet`.

> [!IMPORTANT]
> Run `pnpm check:changed` after your last edit/rebase, right before every push. Never `--no-verify`.

If selection fans out excessively, use scoped checks and report limits. Use the PR base (default `origin/main`; `ORCA_CODE_QUALITY_BASE=<ref>` for stacks). `--base=HEAD` and dirty-only checks provide incremental evidence only.

# Don't Poll the CI

Use `gh run watch <run-id> --compact --exit-status` or `gh pr checks --watch` to prevent token waste

# Repo Rules

- Ensure main is always releasable
- Never break the CI. If it's broken borken, merge fixes.
- **Do not add tests by default.** Low-value tests cost more than they catch. Add one only when it fails if your change is reverted, hardcodes its expected values (never computed by production code, locale files, or mocks), and runs at the single layer that owns the behavior. Never test copy/translations, CSS classes, constants, third-party libraries, private state, timing, or work counts. If you touch a test like that, delete it instead of updating it. See [anti-patterns](./docs/agents-md-refs/test-antipatterns.md).

# Design System

Deck agent launch changes must preserve the user choices in [DECK_AGENT_UX.md](DECK_AGENT_UX.md).

## Preserve Customizations Across Updates

- CLI and Orca upgrades must preserve the accepted Lamng UI and Claude/Codex account/context display documented in [ORCA_UI_HANDOFF.md](ORCA_UI_HANDOFF.md). Do not silently reset these customizations.
- Keep Claude statusline scripts and configuration outside CLI installation directories. Restore missing managed-account statuslines through the existing launch synchronization; preserve explicit custom commands and `null` settings.
- Preserve Codex's native model/context statusline and Orca's pane footer (`account` + `ctx xx%`). The account must remain bound to that terminal session; unavailable context must show `—`, never a guessed value.
- The terminal workbench has no entry animation (2026-10-24): no opacity fade, translate or scale on the surface that holds the xterm canvases — an opacity animation there re-composited every canvas and hitched when a new CLI started painting. Keep the pixel grid stationary, preserve the approved Lamng signature vector, and run `tests/e2e/deck-terminal-startup-stability.spec.ts` when touching that surface.
- Before installing an upgraded build, run the relevant regression checks and hidden UI checks. If an upstream change breaks the display, adapt the integration before replacing the working build; never change authentication, default models, or provider settings to repair it.
- Upstream updates: follow [`LAMNG_UPSTREAM_UPDATE.md`](./LAMNG_UPSTREAM_UPDATE.md): merge only the newest `stablyai/orca` tag once in a separate worktree, drive it with `config/scripts/lamng-upstream-update.sh` (prepare, verify, package, install, retire), resolve conflicts by intent using the playbook table, and require `tc`, related unit tests and every `tests/e2e/deck-*.spec.ts` green before a side-by-side install and hidden smoke. Switch the launcher only after the user approves. `config/scripts/lamng-upstream-check.sh` (daily systemd user timer) reports new tags and previews conflicts; it never merges or installs.

All UI work — layout, color, typography, spacing, component selection, UX behavior — must follow [`docs/STYLEGUIDE.md`](./docs/STYLEGUIDE.md). Use the tokens defined in `src/renderer/src/assets/main.css` (the canonical source) and the shadcn primitives in `src/renderer/src/components/ui/`. Don't invent new color values, font sizes, or shadow tiers when a documented one already covers the role. Read the `docs/styleguide/` deep dive it links only when your change touches that topic. When STYLEGUIDE.md is silent, follow the resolution order in its final section.

# Electron UI Validation

- Always run tests and agent-launched apps in the background with `ORCA_BACKGROUND_LAUNCH=1`.
- Never steal monitor focus or reveal test windows: no `show()`, `showInactive()`, `bringToFront()`, `app.focus()`, or OS activation. Use CDP screenshots of hidden renderers.
- Keep native-focus and visible-window tests paused on the user's desktop; run them on an isolated display or CI.
- Rebuild modified launch-policy code before running an app (stale build wrappers are not safe).
- Use the `$electron` skill and Playwright CDP for rendered Orca UI checks. Do not use computer-use for Orca UI validation.
- Screenshot presentational components without Electron: `pnpm fixtures:shot <id>` ([fixtures](docs/agents-md-refs/component-fixtures.md)).

# Code Style

## Reuse Before Reimplementing

Before writing new logic at any scale extend or generalize it instead of building a parallel version.

## Avoid Comments

- Only use when code does not describe
- BE CONCISE. 1 LINE if possible (why not how)

## File and Module Naming

Never use vague names like `helpers`, `utils`, `common`, `misc`, or `shared-stuff` for files, folders, or modules. They carry zero info and tend to become dumping grounds. Name files after what they _actually_ contain — prefer the concrete domain concept (e.g. `tab-group-state.ts`, `terminal-orphan-cleanup.ts`) over the generic role (`tabs-helpers.ts`, `terminal-utils.ts`). If you find yourself reaching for `helpers`, the file probably has more than one responsibility and should be split, or there's a better name hiding in the code that describes what the functions operate on.

# First Class Citizens

Every change must consider these areas:

1. Cross-Platform Support (mac/linux/windows)
   - Guard platform-specific behavior at runtime; use platform-aware shortcuts, paths, and existing process wrappers. Before changing platform-specific code, processes, shells, shortcuts, paths, or native modules, read [`docs/agents-md-refs/cross-platform-support.md`](./docs/agents-md-refs/cross-platform-support.md).
2. Remote hosts
   - Features should work locally and on remote hosts
3. Mobile
4. Folder Workspaces
   - Don't assume every workspace is a git worktree.

# Footguns

## Git / GitHub

If changing code around `git`, `gh`, source-control, or review behavior read [`docs/agents-md-refs/git-workflow.md`](./docs/agents-md-refs/git-workflow.md).
