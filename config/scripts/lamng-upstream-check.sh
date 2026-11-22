#!/usr/bin/env bash
# Daily check for a newer stablyai/orca release. Previews the merge in memory
# (git merge-tree); never touches a checkout, builds or installs anything.
set -euo pipefail

REPO="${LAMNG_ORCA_REPO:-$HOME/Projects/orca-deck}"
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/orca-upstream-check"
mkdir -p "$STATE"
cd "$REPO"

notify() {
  notify-send --app-name=Orca --icon=orca-ide "$1" "$2" 2>/dev/null || true
}

# Boot-time runs can start before the network is up.
latest=""
for attempt in 1 2 3 4 5; do
  if tags=$(git ls-remote --tags --refs upstream 'v*' 2>/dev/null); then
    latest=$(awk -F/ '{print $3}' <<<"$tags" | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1)
    break
  fi
  sleep 60
done
if [ -z "$latest" ]; then
  echo "$(date -Is) could not reach upstream" >"$STATE/LATEST.txt"
  exit 0
fi

git fetch --quiet --no-tags upstream "refs/tags/$latest:refs/tags/$latest"
# The base is the newest deck-update/* branch (the last installed line); HEAD of this checkout may be older.
branch=${LAMNG_ORCA_BASE:-$(git for-each-ref --sort=-committerdate --count=1 --format='%(refname:short)' 'refs/heads/deck-update/*')}
branch=${branch:-$(git rev-parse --abbrev-ref HEAD)}
if git merge-base --is-ancestor "$latest" "$branch"; then
  echo "$(date -Is) up to date: $branch already contains $latest" >"$STATE/LATEST.txt"
  exit 0
fi

behind=$(git rev-list --count "$branch..$latest")
if conflicts=$(git merge-tree --write-tree --name-only --no-messages "$branch" "$latest" | tail -n +2); then
  summary="$latest available ($behind commits), merges cleanly"
else
  count=$(grep -c . <<<"$conflicts" || true)
  summary="$latest available ($behind commits), $count files conflict"
fi
{
  echo "$(date -Is) $summary"
  echo "branch: $branch"
  [ -n "${conflicts:-}" ] && printf 'conflicting files:\n%s\n' "$conflicts"
  echo "next: ask Claude to update Orca to $latest (follow LAMNG_UPSTREAM_UPDATE.md; latest tag only)"
} >"$STATE/LATEST.txt"

# One desktop notification per release.
if [ "$(cat "$STATE/notified-tag" 2>/dev/null)" != "$latest" ]; then
  notify "Orca $latest đã ra" "${summary#"$latest available "}. Chi tiết: $STATE/LATEST.txt"
  echo "$latest" >"$STATE/notified-tag"
fi
