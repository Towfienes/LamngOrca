import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { TuiAgent } from '../../../shared/tui-agent'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import { agentTypeToIconAgent } from './agent-status'
import type { AppState } from '../store/types'

export type DeckAgentAttention = 'waiting' | 'running' | null

type StatusByPaneKey = Record<string, AgentStatusEntry>

// Why: restored-unconfirmed rows may describe a turn that already ended, so they are never live.
function liveAttention(entry: AgentStatusEntry): Exclude<DeckAgentAttention, null> | null {
  if (entry.restoredUnconfirmed === true || entry.state === 'done') {
    return null
  }
  return entry.state === 'working' ? 'running' : 'waiting'
}

/** Agents with a live pane in any of `tabIds`, as a sorted comma list (primitive for store selectors). */
export function selectRunningAgentsKey(
  statusByPaneKey: StatusByPaneKey,
  tabIds: ReadonlySet<string>
): string {
  const agents = new Set<TuiAgent>()
  for (const [paneKey, entry] of Object.entries(statusByPaneKey)) {
    const agent = agentTypeToIconAgent(entry?.agentType)
    const tabId = parsePaneKey(paneKey)?.tabId
    if (agent && tabId && tabIds.has(tabId) && entry && liveAttention(entry)) {
      agents.add(agent)
    }
  }
  return [...agents].sort().join(',')
}

/** Aggregate state of live agents across `tabIds`: waiting for input outranks running. */
export function selectAgentAttention(
  statusByPaneKey: StatusByPaneKey,
  tabIds: ReadonlySet<string>
): DeckAgentAttention {
  let result: DeckAgentAttention = null
  for (const [paneKey, entry] of Object.entries(statusByPaneKey)) {
    const tabId = parsePaneKey(paneKey)?.tabId
    const attention = tabId && tabIds.has(tabId) && entry ? liveAttention(entry) : null
    if (attention === 'waiting') {
      return 'waiting'
    }
    result = attention ?? result
  }
  return result
}

export type TabAgentSummary = {
  /** Icon agent of the tab's live agent, else of any agent it ran. */
  agent: TuiAgent | null
  attention: DeckAgentAttention
}

/** One pane's agent icon and live state, read straight from its status entry. */
export function summarizePaneAgent(entry: AgentStatusEntry | undefined): TabAgentSummary {
  return entry
    ? { agent: agentTypeToIconAgent(entry.agentType), attention: liveAttention(entry) }
    : { agent: null, attention: null }
}

/** One pass over the status store, keyed by terminal tab id (avoids a scan per tab). */
export function summarizeTabAgents(statusByPaneKey: StatusByPaneKey): Map<string, TabAgentSummary> {
  const byTab = new Map<string, TabAgentSummary>()
  for (const [paneKey, entry] of Object.entries(statusByPaneKey)) {
    const tabId = parsePaneKey(paneKey)?.tabId
    if (!tabId || !entry) {
      continue
    }
    const attention = liveAttention(entry)
    const agent = agentTypeToIconAgent(entry.agentType)
    const previous = byTab.get(tabId)
    if (!previous) {
      byTab.set(tabId, { agent, attention })
      continue
    }
    byTab.set(tabId, {
      agent: (attention && agent) || previous.agent || agent,
      attention:
        previous.attention === 'waiting' || attention === 'waiting'
          ? 'waiting'
          : (attention ?? previous.attention)
    })
  }
  return byTab
}

const NO_TABS: readonly { id: string }[] = []

/** Quick-launch agent types with a live pane anywhere in `worktreeId`. */
export function selectWorktreeRunningAgentsKey(
  state: Pick<AppState, 'agentStatusByPaneKey' | 'tabsByWorktree'>,
  worktreeId: string
): string {
  const tabs = state.tabsByWorktree[worktreeId] ?? NO_TABS
  return selectRunningAgentsKey(state.agentStatusByPaneKey, new Set(tabs.map((tab) => tab.id)))
}
