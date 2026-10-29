import type { AppState } from '@/store/types'
import { isTerminalWorkspaceEmptiedOnPurpose } from '../../../../shared/closed-terminal-tab-tombstones'

/** Deck: an empty root group is the launch chooser's surface, so it stays empty like a recorded close. */
export function isWorkspaceKeptEmpty(
  state: Pick<
    AppState,
    'tabsByWorktree' | 'closedTerminalTabTombstonesByTabId' | 'groupsByWorktree'
  >,
  worktreeId: string
): boolean {
  return (
    isTerminalWorkspaceEmptiedOnPurpose(state, worktreeId) ||
    (state.groupsByWorktree[worktreeId]?.length ?? 0) > 0
  )
}
