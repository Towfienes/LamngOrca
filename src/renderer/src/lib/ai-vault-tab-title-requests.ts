import type { AgentProviderSessionMetadata } from '../../../shared/agent-session-resume'
import type { AgentType } from '../../../shared/agent-status-types'
import type { AiVaultSessionTitle } from '../../../shared/ai-vault-session-title'
import { aiVaultSessionTitleKey, isAiVaultTitleAgent } from '../../../shared/ai-vault-session-title'
import type { ExecutionHostId } from '../../../shared/execution-host'
import { parsePaneKey } from '../../../shared/stable-pane-id'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'
import type { AppState } from '@/store/types'

export type AiVaultTitleRequest = {
  agent: AiVaultSessionTitle['agent']
  executionHostId: ExecutionHostId
  providerSession: AgentProviderSessionMetadata
  refresh: boolean
  tabId: string
  worktreeId: string
}

type RequestCandidate = AiVaultTitleRequest & { priority: number }

function tabIdFromPaneKey(paneKey: string, tabId?: string): string | null {
  return tabId?.trim() || parsePaneKey(paneKey)?.tabId || null
}

function activePaneKey(state: AppState, tabId: string): string | null {
  const activeLeafId = state.terminalLayoutsByTabId[tabId]?.activeLeafId
  return activeLeafId ? `${tabId}:${activeLeafId}` : null
}

type CandidateMaps = {
  /** The one session whose title the tab itself shows (its focused pane wins). */
  byTab: Map<string, RequestCandidate>
  /** Every session, so each agent row and pane can show its own title. */
  bySession: Map<string, RequestCandidate>
}

function registerCandidate(
  state: AppState,
  tabsById: ReadonlyMap<string, TerminalTab>,
  candidates: CandidateMaps,
  args: {
    agent: AgentType | null | undefined
    paneKey: string
    priority: number
    providerSession: AgentProviderSessionMetadata | undefined
    refresh: boolean
    tabId?: string
    worktreeId?: string
  }
): void {
  if (!isAiVaultTitleAgent(args.agent) || !args.providerSession?.id) {
    return
  }
  const tabId = tabIdFromPaneKey(args.paneKey, args.tabId)
  const tab = tabId ? tabsById.get(tabId) : undefined
  const worktreeId = args.worktreeId ?? tab?.worktreeId
  if (!tabId || !tab || !worktreeId) {
    return
  }
  const priority = args.priority + (activePaneKey(state, tabId) === args.paneKey ? 100 : 0)
  const candidate: RequestCandidate = {
    agent: args.agent,
    executionHostId: getExecutionHostIdForWorktree(state, worktreeId),
    providerSession: args.providerSession,
    refresh: args.refresh,
    tabId,
    worktreeId,
    priority
  }
  const sessionKey = aiVaultSessionTitleKey(args.agent, args.providerSession.id)
  const previousSession = candidates.bySession.get(sessionKey)
  if ((previousSession?.priority ?? -1) < priority) {
    candidates.bySession.set(sessionKey, {
      ...candidate,
      refresh: candidate.refresh || previousSession?.refresh === true
    })
  }
  if ((candidates.byTab.get(tabId)?.priority ?? -1) < priority) {
    candidates.byTab.set(tabId, candidate)
  }
}

function collectCandidates(state: AppState): CandidateMaps {
  const tabsById = new Map(
    Object.values(state.tabsByWorktree)
      .flat()
      .map((tab) => [tab.id, tab] as const)
  )
  const candidates: CandidateMaps = { byTab: new Map(), bySession: new Map() }

  for (const entry of Object.values(state.retainedAgentsByPaneKey)) {
    registerCandidate(state, tabsById, candidates, {
      agent: entry.agentType,
      paneKey: entry.entry.paneKey,
      priority: 10,
      providerSession: entry.entry.providerSession,
      refresh: false,
      tabId: entry.entry.tabId,
      worktreeId: entry.worktreeId
    })
  }
  for (const record of Object.values(state.sleepingAgentSessionsByPaneKey)) {
    registerCandidate(state, tabsById, candidates, {
      agent: record.agent,
      paneKey: record.paneKey,
      priority: 20,
      providerSession: record.providerSession,
      refresh: false,
      tabId: record.tabId,
      worktreeId: record.worktreeId
    })
  }
  for (const entry of Object.values(state.agentStatusByPaneKey)) {
    registerCandidate(state, tabsById, candidates, {
      agent: entry.agentType,
      paneKey: entry.paneKey,
      priority: 30,
      providerSession: entry.providerSession,
      refresh: true,
      tabId: entry.tabId,
      worktreeId: entry.worktreeId
    })
  }

  return candidates
}

function toRequests(candidates: Map<string, RequestCandidate>): AiVaultTitleRequest[] {
  return [...candidates.values()].map(({ priority: _priority, ...request }) => request)
}

export function collectAiVaultTitleRequests(state: AppState): AiVaultTitleRequest[] {
  return toRequests(collectCandidates(state).byTab)
}

/** One request per provider session, so split-tab siblings each get their own title. */
export function collectAiVaultSessionTitleRequests(state: AppState): AiVaultTitleRequest[] {
  return toRequests(collectCandidates(state).bySession)
}
