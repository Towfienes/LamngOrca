import type { Tab, TabContentType, TabGroupLayoutNode } from '../../../shared/tab-types'
import type { TuiAgent } from '../../../shared/tui-agent'
import { makePaneKey } from '../../../shared/stable-pane-id'
import type { TerminalPaneLayoutNode } from '../../../shared/terminal-tab-types'
import { resolveUnifiedTabLabel } from '../../../shared/tab-title-resolution'
import type { AppState } from '@/store/types'
import {
  summarizePaneAgent,
  summarizeTabAgents,
  type DeckAgentAttention
} from './deck-agent-activity'

export type WorkspaceTabPane = {
  leafId: string
  agent: TuiAgent | null
  attention: DeckAgentAttention
}

export type WorkspaceTabDot = {
  /** Unified tab id. */
  id: string
  groupId: string
  title: string
  paneCount: number
  /** Terminal tab whose pane layout the hover preview draws; null for non-terminal tabs. */
  previewTabId: string | null
  /** Drawn inside the dot (caelestia-style): the tab's agent, else its content type. */
  agent: TuiAgent | null
  contentType: TabContentType
  attention: DeckAgentAttention
  /** Terminal panes in layout order, one icon each (caelestia shows a workspace's windows). */
  panes: readonly WorkspaceTabPane[]
  active: boolean
}

type DotsState = Pick<
  AppState,
  | 'groupsByWorktree'
  | 'layoutByWorktree'
  | 'activeGroupIdByWorktree'
  | 'unifiedTabsByWorktree'
  | 'terminalLayoutsByTabId'
  | 'agentStatusByPaneKey'
  | 'settings'
>

/** Hollow slots after the occupied dots; clicking one opens a new workspace (Hyprland-style). */
export const WORKSPACE_EMPTY_SLOTS = 3

export const NO_WORKSPACE_TAB_DOTS: readonly WorkspaceTabDot[] = Object.freeze([])

function firstLeafGroupId(node: TabGroupLayoutNode): string {
  return node.type === 'leaf' ? node.groupId : firstLeafGroupId(node.first)
}

function collectLeafIds(node: TerminalPaneLayoutNode | null | undefined): string[] {
  if (!node) {
    return []
  }
  return node.type === 'leaf'
    ? [node.leafId]
    : [...collectLeafIds(node.first), ...collectLeafIds(node.second)]
}

const NO_PANES: readonly WorkspaceTabPane[] = Object.freeze([])

export function countPaneLeaves(node: TerminalPaneLayoutNode | null | undefined): number {
  if (!node) {
    return 0
  }
  return node.type === 'leaf' ? 1 : countPaneLeaves(node.first) + countPaneLeaves(node.second)
}

/** The strip that hosts the dots: the first group on screen, so they stay put when focus moves. */
export function selectTabDotsHostGroupId(
  state: Pick<DotsState, 'groupsByWorktree' | 'layoutByWorktree'>,
  worktreeId: string
): string | null {
  const layout = state.layoutByWorktree[worktreeId]
  return layout ? firstLeafGroupId(layout) : (state.groupsByWorktree[worktreeId]?.[0]?.id ?? null)
}

/** True for the strip that draws the dots while the worktree has tabs: that strip shows dots instead of tabs. */
export function selectIsTabDotsStrip(
  state: Pick<DotsState, 'groupsByWorktree' | 'layoutByWorktree' | 'unifiedTabsByWorktree'>,
  worktreeId: string,
  groupId: string | undefined
): boolean {
  return (
    groupId !== undefined &&
    (state.unifiedTabsByWorktree[worktreeId]?.length ?? 0) > 0 &&
    selectTabDotsHostGroupId(state, worktreeId) === groupId
  )
}

/** One dot per tab of the worktree's active group, in tab-strip order; always at least one while a tab exists. */
export function selectWorkspaceTabDots(
  state: DotsState,
  worktreeId: string
): readonly WorkspaceTabDot[] {
  const groups = state.groupsByWorktree[worktreeId] ?? []
  const group = groups.find((g) => g.id === state.activeGroupIdByWorktree[worktreeId]) ?? groups[0]
  if (!group) {
    return NO_WORKSPACE_TAB_DOTS
  }
  const groupTabs = (state.unifiedTabsByWorktree[worktreeId] ?? []).filter(
    (tab) => tab.groupId === group.id
  )
  const byId = new Map(groupTabs.map((tab) => [tab.id, tab]))
  const ordered = [
    ...group.tabOrder.flatMap((id) => byId.get(id) ?? []),
    ...groupTabs.filter((tab) => !group.tabOrder.includes(tab.id))
  ]
  const titlesGenerated = state.settings?.tabAutoGenerateTitle === true
  const agentsByTab = summarizeTabAgents(state.agentStatusByPaneKey)
  return ordered.map((tab: Tab, index) => {
    const terminalId = tab.contentType === 'terminal' ? tab.entityId : null
    return {
      id: tab.id,
      groupId: group.id,
      title: resolveUnifiedTabLabel(tab, titlesGenerated, `Tab ${index + 1}`),
      paneCount: Math.max(
        1,
        terminalId ? countPaneLeaves(state.terminalLayoutsByTabId?.[terminalId]?.root) : 0
      ),
      previewTabId: terminalId,
      agent: terminalId ? (agentsByTab.get(terminalId)?.agent ?? null) : null,
      contentType: tab.contentType,
      attention: terminalId ? (agentsByTab.get(terminalId)?.attention ?? null) : null,
      panes: terminalId
        ? collectLeafIds(state.terminalLayoutsByTabId?.[terminalId]?.root).map((leafId) => ({
            leafId,
            ...summarizePaneAgent(state.agentStatusByPaneKey[makePaneKey(terminalId, leafId)])
          }))
        : NO_PANES,
      active: tab.id === group.activeTabId
    }
  })
}

/**
 * Memoized `selectWorkspaceTabDots` for one subscriber: unrelated store writes (terminal output,
 * focus, settings) leave every input reference unchanged, so they return the cached array.
 */
export function createWorkspaceTabDotsSelector(): (
  state: DotsState,
  worktreeId: string
) => readonly WorkspaceTabDot[] {
  let inputs: readonly unknown[] = []
  let cached: readonly WorkspaceTabDot[] = NO_WORKSPACE_TAB_DOTS
  return (state, worktreeId) => {
    const next = [
      worktreeId,
      state.groupsByWorktree[worktreeId],
      state.activeGroupIdByWorktree[worktreeId],
      state.unifiedTabsByWorktree[worktreeId],
      state.terminalLayoutsByTabId,
      state.agentStatusByPaneKey,
      state.settings?.tabAutoGenerateTitle
    ]
    if (next.length === inputs.length && next.every((value, index) => value === inputs[index])) {
      return cached
    }
    inputs = next
    const computed = selectWorkspaceTabDots(state, worktreeId)
    cached = workspaceTabDotsEqual(cached, computed) ? cached : computed
    return cached
  }
}

export function workspaceTabDotsEqual(
  a: readonly WorkspaceTabDot[],
  b: readonly WorkspaceTabDot[]
): boolean {
  return (
    a.length === b.length &&
    a.every((dot, index) => {
      const other = b[index]
      return (
        dot.id === other.id &&
        dot.groupId === other.groupId &&
        dot.title === other.title &&
        dot.paneCount === other.paneCount &&
        dot.previewTabId === other.previewTabId &&
        dot.agent === other.agent &&
        dot.contentType === other.contentType &&
        dot.attention === other.attention &&
        dot.panes.length === other.panes.length &&
        dot.panes.every(
          (pane, paneIndex) =>
            pane.leafId === other.panes[paneIndex].leafId &&
            pane.agent === other.panes[paneIndex].agent &&
            pane.attention === other.panes[paneIndex].attention
        ) &&
        dot.active === other.active
      )
    })
  )
}
