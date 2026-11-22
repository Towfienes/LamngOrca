# Lamng upstream update playbook

Goal: move Lamng Orca to a new `stablyai/orca` release with the least agent time. Written after the
v1.4.244 -> v1.4.250 update, which cost far too much because it merged six tags one by one.

## Rules that save the most

1. **Merge only the newest tag, once.** Never walk through intermediate tags: each one re-resolves the
   same files and repeats typecheck, units and E2E. Git applies all intermediate changes in one merge.
2. **Update only when wanted** (needed fix/feature, or about monthly). `lamng-upstream-check.sh` (daily timer)
   reports a new tag; that is not a reason to update.
3. **Scripts do the mechanical work and print one verdict line.** Read a log only when a step fails.
4. **Run long steps in the background and wait for the completion notification.** Do not poll.
5. **Verify once, at the end.** Typecheck, targeted units, all `deck-*.spec.ts` once; rerun only failed
   tests (`--last-failed`) to separate flakes. Do not rerun the whole suite per conflict batch.
6. **Read conflict hunks, not whole files.** Group conflicts by area and resolve each group with one scripted
   pass (`ours` / `theirs` / combined) instead of editing file by file.
7. Mechanical or log-reading work can go to a cheaper worker; resolving conflicts by intent stays with the main agent.

## Flow

```text
cd ~/Projects/orca-deck          # or any checkout; scripts use LAMNG_ORCA_REPO
config/scripts/lamng-upstream-update.sh prepare vX.Y.Z   # worktree, ONE merge (diff3 markers), deps, import remap
# resolve conflicts (table below), git add -A, then commit (hooks lint every staged file: see Gotchas)
config/scripts/lamng-upstream-update.sh verify  ~/Projects/orca-update-X.Y.Z
config/scripts/lamng-upstream-update.sh package ~/Projects/orca-update-X.Y.Z
config/scripts/lamng-upstream-update.sh install ~/Projects/orca-update-X.Y.Z            # side-by-side + hidden smoke
config/scripts/lamng-upstream-update.sh install ~/Projects/orca-update-X.Y.Z --switch   # only after the user approves
config/scripts/lamng-upstream-update.sh retire  ~/Applications/Orca-<old>-Lamng          # after the user runs the new one
```

Before `prepare`, commit all accepted UI work on the base branch (the newest `deck-update/*`) so the
update branch carries it. Keep unrelated WIP (e.g. the Claude9 files) out of that commit.
`prepare` stops at conflicts without committing; it never installs or switches anything by itself.

## Recurring conflict resolutions (decide by intent, not by side)

| Area                           | Keep                                                                                                                                                        |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Theme / sidebar tokens         | Lamng black/dim tokens and sidebar styling, not upstream's brighter theme.                                                                                  |
| Pane chrome                    | Combine the doubled-pane-padding fix with upstream's pane-footer-height reservation.                                                                        |
| `TerminalSurface`              | Quick Launch + VS Code overlays, plus any new upstream notices.                                                                                             |
| `editor-save-queue`            | Upstream's new capture/buildRequest + autosave structure, with the VS Code `queueSave`/save route re-inserted. Never paste the old queue block over it.     |
| Tab bar                        | Extracted new-tab menu and dot-only header, adapted to upstream's `AgentPickerEntry`; keep pane-launch shortcut suppression.                                |
| Webview/guest security         | VS Code guest attach together with upstream plugin attach/dialog policies; keep custom editor Find/close forwarding.                                        |
| Codex registration             | Upstream config sync plus our auth-snapshot rollback around login. Never read real auth data.                                                               |
| ai-vault titles                | Per-session titles alongside upstream's last-reported/pane/tab filters.                                                                                     |
| Mixed-version runtime settings | Preserve legacy flags for compatibility.                                                                                                                    |
| `button.tsx`                   | Upstream variants plus our `glass` variant.                                                                                                                 |
| `package.json` / lockfile      | Take upstream's, then re-add only our own deps; `pnpm install --frozen-lockfile` must pass.                                                                 |
| Tests/fixtures                 | Ours when they encode Deck behavior; upstream's otherwise. Deck E2E specs are the update contract.                                                          |
| Moved shared modules           | Upstream periodically regroups `src/shared/*` into subfolders: let `lamng-remap-imports.py` fix our files' imports; fix the printed ambiguous ones by hand. |

Add a row whenever a new recurring decision appears.

## Gotchas (each cost real time)

- **Hooks**: `git commit` lint-stages every staged file (thousands after a big merge). Run
  `node_modules/.bin/oxlint --threads 4` on the staged files first. Default 16 threads gets OOM-killed on a 14 GB machine:
  close heavy apps before verify/commit and run the commit in the background.
- `max-lines` is 300 for non-blank code lines; a one-specifier import can stay on one line, so splitting
  `import { a, type B }` into two single-line imports saves lines.
- **Unit tests** must go through `node config/scripts/run-vitest.mjs run --config config/vitest.config.ts <paths>`;
  plain `vitest run` cannot resolve the `@` alias.
- **Production build** needs `pnpm -C mobile install --frozen-lockfile` first (the scripts do this).
  Install dependencies for real in each worktree; never through a shared `node_modules` symlink.
- E2E build is not the production build; package with `build:unpack` and smoke the installed app.
- `ln: /usr/local/bin/orca-dev: Permission denied` in E2E logs is harmless.
- Known flake: `deck-vscode-editor.spec.ts` notebook test ("VS Code could not save the file") passes when rerun alone.
- Never quit, restart, focus or reveal the user's running app or windows (`ORCA_BACKGROUND_LAUNCH=1`).
- The PTY daemon (`daemon-vNN`) of the old app keeps serving live terminals after the new app starts;
  `retire` keeps `resources/app.asar.unpacked` until that daemon has exited. Do not delete an old app directory by hand.
- `lamng-install-renderer.mjs` now targets the newest `~/Applications/Orca-*-Lamng` (override with `LAMNG_APP`).
- Preserve Lamng accounts, contexts, notebooks, Quick Launch, notes; never change auth, default models or provider settings.
- Install writes a state backup to `~/.local/state/orca-update-<ver>/<date>/`; launcher files are copied there before `--switch`.

## Done checklist

`prepare` clean -> conflicts resolved -> committed -> `verify` prints `VERIFIED` -> `package` PASS -> `install` smoke PASS ->
user approves `--switch` -> user reopens Orca -> `retire` old app -> delete the update worktree/branches that are merged,
overwrite `.handover/LATEST.md` (30 lines max).
