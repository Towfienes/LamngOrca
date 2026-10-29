import { getWorktreeHostIdentity } from '../../../../../../shared/worktree/host-qualified-identity'
import { PINNED_GROUP_KEY } from './group-keys'
import type { Row, WorktreeRow } from './row-types'

function sameRepoSection(left: WorktreeRow, right: Row): right is WorktreeRow {
  return (
    right.type === 'item' &&
    left.sectionKey === right.sectionKey &&
    getWorktreeHostIdentity({ id: left.worktree.repoId, hostId: left.worktree.hostId }) ===
      getWorktreeHostIdentity({ id: right.worktree.repoId, hostId: right.worktree.hostId })
  )
}

/** Display repo membership without changing persisted lineage or Git ancestry. */
export function withRepoWorktreeTree(rows: Row[]): Row[] {
  const result: Row[] = []
  let changed = false
  for (let index = 0; index < rows.length;) {
    const first = rows[index]
    if (first.type !== 'item' || first.sectionKey === PINNED_GROUP_KEY) {
      result.push(first)
      index++
      continue
    }
    let end = index + 1
    while (end < rows.length && sameRepoSection(first, rows[end])) {
      end++
    }
    const group = rows.slice(index, end).filter((row): row is WorktreeRow => row.type === 'item')
    const mains = group.filter((row) => row.depth === 0 && row.worktree.isMainWorktree)
    if (mains.length !== 1 || group.length < 2) {
      result.push(...group)
      index = end
      continue
    }
    const main = mains[0]
    const mainIndex = group.indexOf(main)
    let subtreeEnd = mainIndex + 1
    while (subtreeEnd < group.length && group[subtreeEnd].depth > main.depth) {
      subtreeEnd++
    }
    const mainSubtree = group.slice(mainIndex, subtreeEnd)
    const levels = new Map<WorktreeRow, number>()
    // Lineage children hang off their parent like any worktree: one level deeper per lineage depth.
    for (const row of mainSubtree) {
      levels.set(row, row.depth)
    }
    const ordered = [...mainSubtree, ...group.slice(0, mainIndex), ...group.slice(subtreeEnd)]
    for (const row of ordered) {
      levels.set(row, levels.get(row) ?? row.depth + 1)
    }
    const levelAt = (position: number): number => levels.get(ordered[position])!
    const lastByLevel: boolean[] = []
    ordered.forEach((row, position) => {
      const level = levelAt(position)
      let next = position + 1
      while (next < ordered.length && levelAt(next) > level) {
        next++
      }
      const isLast = next >= ordered.length || levelAt(next) < level
      lastByLevel[level] = isLast
      result.push({
        ...row,
        // Why: flattened so the card draws as a plain tree row; lineage data stays on the worktree.
        depth: 0,
        lineageTrail: [],
        isLastLineageChild: false,
        lineageChildCount: 0,
        lineageGroupKey: undefined,
        lineageCollapsed: undefined,
        repoTree: position === 0 ? 'root' : isLast ? 'last' : 'branch',
        repoTreeLevel: level,
        repoTreeHasChildren: position + 1 < ordered.length && levelAt(position + 1) > level,
        repoTreeTrail: Array.from(
          { length: Math.max(0, level - 1) },
          (_, trunk) => lastByLevel[trunk + 1] === false
        )
      })
    })
    changed = true
    index = end
  }
  return changed ? result : rows
}
