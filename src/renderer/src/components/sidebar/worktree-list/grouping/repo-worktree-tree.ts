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
    const roots = group.filter((row) => row.depth === 0)
    const mains = roots.filter((row) => row.worktree.isMainWorktree)
    if (mains.length !== 1 || roots.length < 2) {
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
    const ordered = [
      ...group.slice(mainIndex, subtreeEnd),
      ...group.slice(0, mainIndex),
      ...group.slice(subtreeEnd)
    ]
    const lastRoot = ordered.findLast((row) => row.depth === 0)
    for (const row of ordered) {
      result.push(
        row.depth > 0
          ? row
          : {
              ...row,
              repoTree: row === main ? 'root' : row === lastRoot ? 'last' : 'branch'
            }
      )
    }
    changed = true
    index = end
  }
  return changed ? result : rows
}
