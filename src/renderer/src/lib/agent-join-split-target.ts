import type { TerminalPaneLayoutNode } from '../../../shared/terminal-tab-types'
import {
  findLargestPaneSplit,
  type PaneSplitDirection
} from '../../../shared/terminal-pane-largest-split'

export type AgentJoinSplitTarget = {
  /** Terminal tab (entity) id the new agent pane joins. */
  tabId: string
  leafId: string
  direction: PaneSplitDirection
}

// Structural slice of AppState: only what the join reads.
type JoinState = {
  groupsByWorktree: Record<
    string,
    readonly { id: string; activeTabId: string | null; tabOrder: readonly string[] }[] | undefined
  >
  activeGroupIdByWorktree: Record<string, string | undefined>
  unifiedTabsByWorktree: Record<
    string,
    readonly { id: string; entityId: string; groupId: string; contentType: string }[] | undefined
  >
  terminalLayoutsByTabId: Record<string, { root: TerminalPaneLayoutNode | null } | undefined>
}

/** Where a newly launched agent joins the worktree's open workspace instead of opening a tab. */
export function selectAgentJoinSplitTarget(
  state: JoinState,
  worktreeId: string
): AgentJoinSplitTarget | null {
  const groups = state.groupsByWorktree[worktreeId] ?? []
  const group = groups.find((g) => g.id === state.activeGroupIdByWorktree[worktreeId]) ?? groups[0]
  if (!group) {
    return null
  }
  const terminals = (state.unifiedTabsByWorktree[worktreeId] ?? []).filter(
    (tab) => tab.groupId === group.id && tab.contentType === 'terminal'
  )
  const ordered = [
    ...terminals.filter((tab) => tab.id === group.activeTabId),
    ...group.tabOrder.flatMap((id) => terminals.filter((tab) => tab.id === id))
  ]
  for (const tab of ordered) {
    const layout = state.terminalLayoutsByTabId[tab.entityId]
    if (layout?.root) {
      return { tabId: tab.entityId, ...findLargestPaneSplit(layout.root) }
    }
  }
  return null
}
