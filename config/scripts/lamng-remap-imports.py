#!/usr/bin/env python3
"""Repair relative imports that upstream moved to another folder.

Usage: lamng-remap-imports.py <worktree> --only <files.txt> [--apply] [--report out.json]
  --only   newline list of repo-relative files to consider. Pass the files that differ from the
           upstream tag (`git diff --name-only <tag>`): upstream's own files are already consistent,
           and touching them (e.g. import-looking strings in fixtures) corrupts them.
  --apply  write changes; without it the script only prints what it would do.
An import is rewritten only when its target is missing AND exactly one source file has that
basename. Ambiguous ones are printed for manual fixing; ones with no candidate are left to `pnpm tc`.
"""
import argparse, collections, json, os, re
from pathlib import Path

ap = argparse.ArgumentParser()
ap.add_argument('worktree')
ap.add_argument('--only', required=True)
ap.add_argument('--apply', action='store_true')
ap.add_argument('--report')
args = ap.parse_args()
root = Path(args.worktree).resolve()
only = {l.strip() for l in Path(args.only).read_text().splitlines() if l.strip()}

all_src = [p for ext in ('*.ts', '*.tsx') for p in (root / 'src').rglob(ext)]
by_stem = collections.defaultdict(list)
for f in all_src:
    by_stem[f.stem].append(f)
targets = [p for p in all_src if str(p.relative_to(root)) in only]

# Real import/export statements only: line-start import/export, a `} from` continuation, or import().
STMT = re.compile(
    r"""(?m)(^[ \t]*(?:import|export)\b[^\n'"]*?\bfrom\s+["']|^[ \t]*\}\s*from\s+["']|^[ \t]*import\s+["']|\bimport\(\s*["'])([^"']+)(["'])"""
)
changes, ambiguous, missing = [], [], []


def exists(target: Path) -> bool:
    if target.suffix in ('.js', '.mjs', '.cjs'):
        return exists(target.with_suffix(''))
    return (
        target.is_file()
        or any(Path(str(target) + ext).is_file() for ext in ('.ts', '.tsx', '.js', '.json'))
        or (target / 'index.ts').is_file()
        or (target / 'index.tsx').is_file()
    )


for path in targets:
    text = path.read_text()

    def remap(m: re.Match) -> str:
        old = m.group(2)
        if not old.startswith('.') or exists(path.parent / old):
            return m.group(0)
        name = Path(old).name
        stem = Path(name).stem if Path(name).suffix in ('.js', '.mjs', '.cjs') else name
        found = by_stem.get(stem, [])
        rel = str(path.relative_to(root))
        if len(found) != 1:
            (ambiguous if len(found) > 1 else missing).append([rel, old, len(found)])
            return m.group(0)
        new = os.path.relpath(found[0].with_suffix(''), path.parent).replace('\\', '/')
        new = new if new.startswith('.') else './' + new
        changes.append([rel, old, new])
        return m.group(1) + new + m.group(3)

    updated = STMT.sub(remap, text)
    if args.apply and updated != text:
        path.write_text(updated)

mode = 'applied' if args.apply else 'dry-run'
print(f'[{mode}] {len(changes)} remapped, {len(ambiguous)} ambiguous, {len(missing)} without candidate (left to pnpm tc)')
if args.report:
    Path(args.report).write_text(json.dumps({'changes': changes, 'ambiguous': ambiguous, 'missing': missing}, indent=2))
for rel, old, new in changes[:10]:
    print('  remap:', rel, old, '->', new)
for entry in ambiguous[:20]:
    print('  ambiguous:', *entry)
