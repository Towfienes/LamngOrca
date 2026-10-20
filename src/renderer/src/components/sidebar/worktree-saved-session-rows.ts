import type { DashboardAgentRow } from '@/components/dashboard/useDashboardData'
import {
  agentProviderSessionsEqual,
  type SleepingAgentSessionRecord
} from '../../../../shared/agent-session-resume'
import type {
  TerminalLayoutSnapshot,
  TerminalPaneLayoutNode,
  TerminalTab
} from '../../../../shared/terminal-tab-types'
import type { AppState } from '@/store/types'
import { parsePaneKey } from '../../../../shared/stable-pane-id'

function containsLeaf(root: TerminalPaneLayoutNode | null | undefined, leafId: string): boolean {
  return Boolean(
    root &&
    (root.type === 'leaf'
      ? root.leafId === leafId
      : containsLeaf(root.first, leafId) || containsLeaf(root.second, leafId))
  )
}

export function appendSavedSessionRows(
  rows: DashboardAgentRow[],
  records: readonly SleepingAgentSessionRecord[],
  tabs: readonly TerminalTab[],
  layouts: Record<string, TerminalLayoutSnapshot | undefined>,
  shellPanes: ReadonlySet<string>
): DashboardAgentRow[] {
  const savedByPane = new Map(records.map((record) => [record.paneKey, record]))
  const presented = rows.map((row) => {
    const record = savedByPane.get(row.paneKey)
    if (
      !record?.model ||
      row.entry.model ||
      row.agentType !== record.agent ||
      shellPanes.has(row.paneKey)
    ) {
      return row
    }
    const parsed = parsePaneKey(row.paneKey)
    const matches = row.entry.providerSession
      ? agentProviderSessionsEqual(record.agent, row.entry.providerSession, record.providerSession)
      : row.entry.observation?.origin === 'title' &&
        Boolean(record.ptyId) &&
        parsed &&
        record.ptyId === layouts[parsed.tabId]?.ptyIdsByLeafId?.[parsed.leafId]
    // A title-only projection can retain the last observed model of the same PTY.
    return matches ? { ...row, entry: { ...row.entry, model: record.model } } : row
  })
  const seen = new Set(rows.map((row) => row.paneKey))
  const byId = new Map(tabs.map((tab) => [tab.id, tab]))
  const saved: DashboardAgentRow[] = []
  for (const record of records) {
    const parsed = parsePaneKey(record.paneKey)
    const tab = parsed && byId.get(parsed.tabId)
    if (
      !parsed ||
      !tab ||
      seen.has(record.paneKey) ||
      shellPanes.has(record.paneKey) ||
      !containsLeaf(layouts[tab.id]?.root, parsed.leafId)
    ) {
      continue
    }
    // A saved pane is resumable history, never evidence of a running or completed turn.
    saved.push({
      paneKey: record.paneKey,
      tab,
      agentType: record.agent,
      state: 'idle',
      rowSource: 'live',
      startedAt: record.capturedAt,
      entry: {
        paneKey: record.paneKey,
        tabId: tab.id,
        worktreeId: record.worktreeId,
        agentType: record.agent,
        state: record.state,
        prompt: record.prompt || record.terminalTitle || '',
        providerSession: record.providerSession,
        model: record.model,
        reasoningEffort: record.reasoningEffort,
        updatedAt: record.updatedAt,
        stateStartedAt: record.capturedAt,
        stateHistory: [],
        restoredUnconfirmed: true
      }
    })
  }
  return saved.length
    ? [...presented, ...saved]
    : presented.every((row, index) => row === rows[index])
      ? rows
      : presented
}

let source: AppState['sleepingAgentSessionsByPaneKey'] | undefined
let byWorktree = new Map<string, SleepingAgentSessionRecord[]>()
const EMPTY_RECORDS: SleepingAgentSessionRecord[] = []
export function selectSavedSessionsForWorktree(
  state: Pick<AppState, 'sleepingAgentSessionsByPaneKey'>,
  worktreeId: string
): SleepingAgentSessionRecord[] {
  if (source !== state.sleepingAgentSessionsByPaneKey) {
    source = state.sleepingAgentSessionsByPaneKey
    byWorktree = new Map()
    for (const record of Object.values(source)) {
      const bucket = byWorktree.get(record.worktreeId)
      if (bucket) {
        bucket.push(record)
      } else {
        byWorktree.set(record.worktreeId, [record])
      }
    }
  }
  return byWorktree.get(worktreeId) ?? EMPTY_RECORDS
}
