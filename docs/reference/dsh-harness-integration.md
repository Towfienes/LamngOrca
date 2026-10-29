# DeepSeek Harness integration

Orca detects the community `@deepseek-harness-tui/dsh-tui` launcher (`dsh-tui`, alias
`dst`) and requires the official `@deepseek-ai/dsh` executable too. The launcher
boots the `dsh-tui` profile; Orca passes `.` to select the current workspace and
reach its composer on the first launch. The official Harness does not bundle this community TUI.
DSH Console and DeepSeek Build are separate products and are not interchangeable
with this launch contract.

The official DSH 0.2 CLI accepts both `dsh --profile headless` and `dsh headless`.
Orca excludes the known `web`, `headless`, `sdk`, `sdk-minimal`, `acp`, and `desktop`
profiles from interactive process recognition, along with plugin management and
configuration dumps. Custom profile names remain eligible because profiles are
user configurable. Only launcher arguments are inspected; app prompts, resume IDs,
and patch filenames cannot change the selected profile's identity.

Status hooks use the official `@deepseek-ai/dsh-hooks-claude-code` plugin, installed
as an owned block in `$DSH_HOME/cordis.patch.yml`. User entries outside the block are
preserved. Local installation respects `DSH_HOME`; the existing SSH installer uses
the execution host's default `~/.dsh` because SFTP cannot read its environment.
The selected profile must also install both `@deepseek-ai/dsh-hooks-claude-code` and
`@deepseek-ai/dsh-hook-protocol`. A patch row alone does not install a package;
DSH 0.2.1-rc.2 lists these as development dependencies, so they can be absent from
an ordinary CLI installation. In that case the loader warns that `orca-agent-hooks`
failed to import, no session identity reaches Orca, and Sleep → Wake opens a shell.
For that core version, install the matching packages in the persistent TUI profile:

```sh
dsh plugin --profile dsh-tui add --save-exact \
  @deepseek-ai/dsh-hooks-claude-code@0.2.1-rc.2 \
  @deepseek-ai/dsh-hook-protocol@0.2.1-rc.2
```

These are plain profile dependencies, not bundle layers; keep Orca's existing
managed patch as the single configured bridge. Reopen existing DSH sessions from
history once to load the bridge. When upgrading the core, check compatible package
versions and actual hook delivery before replacing a working installation. Do not
patch files inside the CLI or TUI packages, or change account/model/provider settings.

Hooks report session start, prompt submission, tool start/end, and stopping through
Orca's host status store. Approval has no dedicated hook; it is not inferred from
an uncaptured screen. Subagent lifecycle events are ignored for parent-pane status.

Sidebar rows use each DSH pane's native OSC session title, without its status glyph
and whale, before a tab's generated prompt. Split panes must not inherit a sibling's
generated title or approval-policy notice. Unnamed panes show `DeepSeek Harness`;
manual names and quick-command labels still take precedence.

DSH 0.2 still emits an empty `transcript_path` in Claude-compatible hooks. Its
session persistence defaults to compressed JSONL under `$DSH_HOME/sessions`.
Orca can resume a hook-associated session through `dsh-tui --resume <id>`, and discovers main DSH logs in Agent Session History. Child sessions are excluded
using provider ownership metadata, not their titles.

Sleep/Wake must retain the replacement process's exact launch configuration while
consuming the old sleeping record. Clearing that record also clears its launch
registry entry: preserve a matching new launch token, and do not delete a fresh
live anchor if its SessionStart overtakes the cold-restore reply. Both orders are
covered by connection tests; `tests/e2e/dsh-session-sleep-wake.spec.ts` checks two
Sleep/Wake cycles using real hook ingestion and a per-launch environment marker.

With core 0.2.1-rc.2 and TUI 0.16.1, a fresh empty session can exist only in memory
until an event materializes its log. Such an ID cannot be resumed after termination.
An isolated real-TUI check used the local `/rename` command to materialize the log
before sleeping, then required a new SessionStart with the same ID after each
wake. Do not infer success from replayed terminal text or silently substitute a
different session when the requested log is missing.

## Reproduce the official launcher check

Install `@deepseek-ai/dsh@0.2.0-rc.2` into a disposable prefix, then run:

```sh
ORCA_BACKGROUND_LAUNCH=1 ORCA_REAL_DSH_CLI=/path/to/prefix/node_modules/.bin/dsh \
  pnpm test src/shared/dsh-real-cli.test.ts
```

The opt-in test checks published version, composed profile configurations, and
headless help in an isolated home and working folder without a model request.
Interactive readiness is separately pinned to the captured community TUI transcript
in `src/main/runtime/__fixtures__/dsh-tui-ready-no-key.txt`; that older capture is
not proof of current TUI compatibility or paid generation.
