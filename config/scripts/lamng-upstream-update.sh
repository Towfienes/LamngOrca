#!/usr/bin/env bash
# Mechanical phases of a Lamng upstream update. Prints one verdict line per step and
# keeps full output in LOGS; read a log only when a step fails.
# Flow: prepare -> (resolve conflicts, commit) -> verify -> package -> install [--switch] -> retire
set -euo pipefail

REPO="${LAMNG_ORCA_REPO:-$HOME/Projects/orca-deck}"
APPS="$HOME/Applications"
KEYBINDS="${LAMNG_KEYBINDS:-$HOME/.config/caelestia/caelestia-refined/modules/keybinds.lua}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

die() { echo "FAIL: $*" >&2; exit 1; }
logs_for() { mkdir -p "$HOME/.local/state/orca-upstream-update/$1"; echo "$HOME/.local/state/orca-upstream-update/$1"; }
step() { # step <name> <logfile> <cmd...>
  local name=$1 log=$2; shift 2
  if "$@" >"$log" 2>&1; then echo "PASS  $name  ($log)"; else echo "FAIL  $name  ($log)"; tail -15 "$log"; exit 1; fi
}

cmd_prepare() { # prepare <tag> [base-ref]
  local tag=${1:?tag, e.g. v1.4.251}; local ver=${tag#v}
  local base=${2:-$(git -C "$REPO" for-each-ref --sort=-committerdate --count=1 --format='%(refname:short)' 'refs/heads/deck-update/*')}
  base=${base:-HEAD}
  local wt="$HOME/Projects/orca-update-$ver" branch="deck-update/$(date +%F)-$tag" logs; logs=$(logs_for "$tag")
  [ -e "$wt" ] && die "$wt already exists"
  git -C "$REPO" diff --quiet "$base" -- 2>/dev/null || echo "note: $REPO has uncommitted work; commit accepted work to $base first so it is carried"
  git -C "$REPO" fetch --quiet --no-tags upstream "refs/tags/$tag:refs/tags/$tag"
  git -C "$REPO" worktree add -b "$branch" "$wt" "$base" >"$logs/worktree.log" 2>&1
  # One merge of the newest tag only; diff3 markers give the resolver ours/base/theirs.
  git -C "$wt" -c merge.conflictStyle=diff3 merge --no-commit --no-ff "$tag" >"$logs/merge.log" 2>&1 || true
  git -C "$wt" diff --name-only --diff-filter=U | tee "$logs/conflicts.txt" | wc -l | xargs echo "conflicting files:"
  step deps "$logs/deps.log" bash -c "cd '$wt' && pnpm install --frozen-lockfile && pnpm -C mobile install --frozen-lockfile"
  git -C "$wt" diff --name-only "$tag" >"$logs/our-files.txt"
  step remap "$logs/remap.log" python3 "$HERE/lamng-remap-imports.py" "$wt" --only "$logs/our-files.txt" --apply --report "$logs/remap.json"
  echo "worktree: $wt  branch: $branch  base: $base"
  echo "next: resolve conflicts (see LAMNG_UPSTREAM_UPDATE.md), git add -A, run oxlint on staged files, commit, then: $0 verify $wt"
}

cmd_verify() { # verify <worktree> : typecheck -> units -> all deck E2E (failed ones rerun once)
  local wt=${1:?worktree}; local tag="v$(node -p "require('$wt/package.json').version")" logs; logs=$(logs_for "$tag")
  local avail; avail=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
  [ "$avail" -ge 2500 ] || die "only ${avail}MB RAM available; close heavy apps first (oxlint/tsc get OOM-killed)"
  cd "$wt"
  step typecheck "$logs/tc.log" pnpm tc
  # shellcheck disable=SC2086
  step units "$logs/units.log" node config/scripts/run-vitest.mjs run --config config/vitest.config.ts ${LAMNG_UNIT_PATHS:-src/renderer/src/components/sidebar src/renderer/src/components/tab-group src/renderer/src/components/tab-bar src/renderer/src/store src/main/vscode-editor}
  export ORCA_BACKGROUND_LAUNCH=1
  local e2e=(npx playwright test --config tests/playwright.config.ts --project=electron-headless 'deck-.*\.spec\.ts' --workers=1)
  if ! "${e2e[@]}" >"$logs/e2e.log" 2>&1; then
    echo "e2e: first run had failures, rerunning only failed tests once (flake check)"
    step e2e-rerun "$logs/e2e-rerun.log" npx playwright test --config tests/playwright.config.ts --project=electron-headless --workers=1 --last-failed
  else echo "PASS  e2e  ($logs/e2e.log)"; fi
  echo "VERIFIED $tag"
}

cmd_package() { # package <worktree>
  local wt=${1:?worktree}; local tag="v$(node -p "require('$wt/package.json').version")"
  step package "$(logs_for "$tag")/package.log" bash -c "cd '$wt' && pnpm -C mobile install --frozen-lockfile && pnpm run build:unpack"
}

cmd_install() { # install <worktree> [--switch] : side-by-side copy, hidden smoke, optional launcher switch
  local wt=${1:?worktree}; local switch=${2:-}; local ver; ver=$(node -p "require('$wt/package.json').version")
  local new="$APPS/Orca-$ver-Lamng" logs; logs=$(logs_for "v$ver")
  local cur; cur=$(find "$APPS" -maxdepth 1 -name 'Orca-*-Lamng' ! -path "$new" | sort -V | tail -1)
  [ -n "$cur" ] || die "no existing Orca-*-Lamng app to copy AppRun/glib files from"
  [ -d "$wt/dist/linux-unpacked" ] || die "run package first"
  [ ! -e "$new" ] || die "$new already exists"
  local backup="$HOME/.local/state/orca-update-$ver/$(date +%F)"; mkdir -p "$backup/launchers"
  ( cd "$HOME/.config/orca" && find . -maxdepth 1 -type f -size -50M \( -name '*.json' -o -name '*.db*' -o -name '*.enc' \) ! -name '*sqlite-export*' -exec cp -a {} "$backup/" \; ; cp -a profiles/local-default "$backup/profile-local-default" )
  cp -a "$cur" "$new"
  rsync -a --delete "$wt/dist/linux-unpacked/resources/" "$new/resources/"
  rsync -a --exclude=resources "$wt/dist/linux-unpacked/" "$new/"
  sed -i "s#$(basename "$cur")#Orca-$ver-Lamng#g" "$new"/orca.desktop "$new"/orca-ide.desktop 2>/dev/null || true
  step smoke "$logs/smoke.log" bash -c "cd '$wt' && node config/scripts/lamng-installed-smoke.mjs '$new' '$ver'"
  echo "INSTALLED $new (previous: $cur, state backup: $backup)"
  if [ "$switch" = "--switch" ]; then
    mapfile -t desktops < <(grep -l 'Orca-.*-Lamng/AppRun' "$HOME"/.local/share/applications/*.desktop 2>/dev/null || true)
    cp -a "${desktops[@]}" "$KEYBINDS" "$backup/launchers/" 2>/dev/null || true
    for f in "${desktops[@]}" "$KEYBINDS"; do [ -f "$f" ] && sed -i -E "s#Orca-[0-9.]+-Lamng#Orca-$ver-Lamng#g; s#^Name=Orca \([0-9.]+ Lamng\)#Name=Orca ($ver Lamng)#" "$f"; done
    echo "SWITCHED launcher + Super+A to $ver. Quit and reopen Orca (the running app was not touched)."
  else echo "launcher not switched; rerun with --switch after the user approves"; fi
}

cmd_retire() { # retire <old-app-dir> : delete an old install; keep daemon-held files while its daemon still runs
  local old=${1:?old app dir}
  [ -d "$old" ] || die "$old not found"
  if pgrep -f "$old/" >/dev/null; then
    find "$old" -mindepth 1 -maxdepth 1 ! -name resources -exec rm -rf {} +
    find "$old/resources" -mindepth 1 -maxdepth 1 ! -name app.asar.unpacked -exec rm -rf {} +
    echo "PARTIAL: a process from $old is still running (PTY daemon); kept resources/app.asar.unpacked. Rerun after a full Orca quit/reboot."
  else rm -rf "$old"; echo "DELETED $old"; fi
}

case "${1:-}" in
  prepare|verify|package|install|retire) c=$1; shift; "cmd_$c" "$@" ;;
  *) echo "usage: $0 prepare <tag> [base-ref] | verify <wt> | package <wt> | install <wt> [--switch] | retire <old-app-dir>"; exit 2 ;;
esac
