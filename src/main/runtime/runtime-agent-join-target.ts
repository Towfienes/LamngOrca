import type { RuntimeMobileSessionTabsSnapshot } from '../../shared/runtime-session-contracts'
import type { RuntimeMobileSessionTerminalTab } from '../../shared/runtime-mobile-session-tab-contracts'
import {
  findLargestPaneSplit,
  type PaneSplitDirection
} from '../../shared/terminal-pane-largest-split'
import type { TerminalCreateOptions } from './runtime-terminal-contracts'

export type AgentJoinTarget = { tabId: string; leafId: string; direction: PaneSplitDirection }

/** Agent launches that name no pane, shell or session claim join the open workspace as a split. */
export function shouldJoinOpenWorkspace(
  opts: Pick<
    TerminalCreateOptions,
    | 'command'
    | 'launchAgent'
    | 'launchConfig'
    | 'launchToken'
    | 'tabId'
    | 'leafId'
    | 'shellOverride'
    | 'agentSessionClaim'
  >
): boolean {
  return (
    Boolean(opts.command) &&
    Boolean(opts.launchAgent || opts.launchConfig || opts.launchToken) &&
    !opts.tabId &&
    !opts.leafId &&
    // A split pane inherits its tab's shell, so a shell choice needs its own tab.
    !opts.shellOverride &&
    !opts.agentSessionClaim
  )
}

/** The worktree's open terminal tab (from the renderer's published snapshot) and its largest pane. */
export function selectSnapshotAgentJoinTarget(
  snapshot: Pick<RuntimeMobileSessionTabsSnapshot, 'activeTabId' | 'tabs'> | undefined
): AgentJoinTarget | null {
  const terminals = (snapshot?.tabs ?? []).filter(
    (tab): tab is RuntimeMobileSessionTerminalTab => tab.type === 'terminal'
  )
  const open =
    terminals.find(
      (tab) => tab.parentTabId === snapshot?.activeTabId || tab.id === snapshot?.activeTabId
    ) ??
    terminals.find((tab) => tab.isActive) ??
    terminals[0]
  if (!open) {
    return null
  }
  const root =
    terminals.find((tab) => tab.parentTabId === open.parentTabId && tab.parentLayout?.root)
      ?.parentLayout?.root ?? ({ type: 'leaf', leafId: open.leafId } as const)
  return { tabId: open.parentTabId, ...findLargestPaneSplit(root) }
}

/** Join target for a launch, only when the terminal will be revealed: a hidden one would claim a pane key its tab never shows. */
export function resolveRevealedAgentJoin(
  revealed: boolean,
  opts: Parameters<typeof shouldJoinOpenWorkspace>[0],
  snapshot: Parameters<typeof selectSnapshotAgentJoinTarget>[0]
): AgentJoinTarget | null {
  return revealed && shouldJoinOpenWorkspace(opts) ? selectSnapshotAgentJoinTarget(snapshot) : null
}

/** Reveal fields that split the joined tab at the chosen pane. */
export function agentJoinRevealSplit(target: AgentJoinTarget | null): {
  splitFromLeafId?: string
  splitDirection?: AgentJoinTarget['direction']
} {
  return target ? { splitFromLeafId: target.leafId, splitDirection: target.direction } : {}
}
