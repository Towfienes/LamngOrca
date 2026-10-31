import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { MemorySnapshot } from '../../../shared/process-stats-types'

export type DeckIdleRamRow = {
  key: string
  label: string
  idleSince: number
  frozen: boolean
  memory: number
  swap: number
}

export type DeckIdleRamSummary = {
  rows: DeckIdleRamRow[]
  /** Resident bytes still held by idle scopes; frozen scopes keep only a small remainder. */
  memory: number
  swap: number
}

const EMPTY: DeckIdleRamSummary = { rows: [], memory: 0, swap: 0 }

/** Idle terminal scopes reported by the optional orca-tab-memlimit service, longest idle first. */
export function summarizeDeckIdleRam(
  snapshot: MemorySnapshot | null,
  statusByPaneKey: Record<string, AgentStatusEntry>
): DeckIdleRamSummary {
  if (!snapshot) {
    return EMPTY
  }
  const rows: DeckIdleRamRow[] = []
  for (const worktree of snapshot.worktrees) {
    for (const session of worktree.sessions) {
      const idle = session.idle
      if (!idle) {
        continue
      }
      const status = session.paneKey ? statusByPaneKey[session.paneKey] : undefined
      rows.push({
        key: session.sessionId,
        label: status?.terminalTitle || status?.prompt || worktree.worktreeName,
        idleSince: idle.idleSince,
        frozen: idle.frozen,
        memory: idle.cgroupMemory,
        swap: idle.cgroupSwap
      })
    }
  }
  if (rows.length === 0) {
    return EMPTY
  }
  rows.sort((a, b) => a.idleSince - b.idleSince)
  return {
    rows,
    memory: rows.reduce((sum, row) => sum + row.memory, 0),
    swap: rows.reduce((sum, row) => sum + row.swap, 0)
  }
}

/** Compact byte label for the dock badge, e.g. 940M or 1.2G. */
export function formatDeckIdleBytes(bytes: number): string {
  const mib = bytes / (1024 * 1024)
  if (mib < 1024) {
    return `${Math.round(mib)}M`
  }
  return `${(mib / 1024).toFixed(1)}G`
}

export function formatDeckIdleDuration(ms: number): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000))
  if (minutes < 60) {
    return `${minutes}m`
  }
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`
}
