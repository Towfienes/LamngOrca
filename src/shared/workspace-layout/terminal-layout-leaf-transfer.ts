import type { TerminalLayoutSnapshot } from './terminal-tab-types'
import {
  collectLayoutLeafIdsInOrder,
  firstLayoutLeafId,
  insertLeafBeside
} from './terminal-pane-tree'
import { retireLeavesFromTerminalLayout } from './terminal-layout-leaf-retirement'

/** Transfer only this leaf's records; target scrollback and bindings stay intact. */
export function transferTerminalLayoutLeaf(
  source: TerminalLayoutSnapshot,
  target: TerminalLayoutSnapshot | null,
  leafId: string,
  ptyId: string | null
): TerminalLayoutSnapshot {
  const otherLeaves = collectLayoutLeafIdsInOrder(source.root).filter((id) => id !== leafId)
  const moved = retireLeavesFromTerminalLayout(source, new Set(otherLeaves))
  if (!moved?.root || !collectLayoutLeafIdsInOrder(moved.root).includes(leafId)) {
    throw new Error('pane_not_found')
  }
  const beside = target?.root ? firstLayoutLeafId(target.root) : null
  return {
    ...target,
    root:
      target?.root && beside
        ? collectLayoutLeafIdsInOrder(target.root).includes(leafId)
          ? target.root
          : insertLeafBeside(target.root, beside, leafId, 'right')
        : moved.root,
    activeLeafId: leafId,
    expandedLeafId: null,
    ...(target?.chatLeafId || source.chatLeafId === leafId
      ? { chatLeafId: target?.chatLeafId ?? leafId }
      : {}),
    ptyIdsByLeafId: { ...target?.ptyIdsByLeafId, ...(ptyId ? { [leafId]: ptyId } : {}) },
    buffersByLeafId: { ...target?.buffersByLeafId, ...moved.buffersByLeafId },
    scrollbackRefsByLeafId: { ...target?.scrollbackRefsByLeafId, ...moved.scrollbackRefsByLeafId },
    titlesByLeafId: { ...target?.titlesByLeafId, ...moved.titlesByLeafId },
    lastGridsByLeafId: {
      ...target?.lastGridsByLeafId,
      ...(source.lastGridsByLeafId?.[leafId] ? { [leafId]: source.lastGridsByLeafId[leafId] } : {})
    }
  }
}
