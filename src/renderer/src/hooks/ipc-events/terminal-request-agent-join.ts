import { selectAgentJoinSplitTarget } from '@/lib/agent-join-split-target'
import { createBrowserUuid } from '@/lib/browser-uuid'
import type { AppState } from '../../store/types'
import type { RuntimeTerminalCreateRequestPayload } from '../../../../shared/runtime-terminal-contracts'
import { routeRuntimeTerminalSplitRequest } from './terminal-ui-routing-ipc-bridge'

export type AgentJoinResult = { tabId: string; leafId: string }

/** Agent launches with no explicit placement join the open workspace; everything else keeps its own tab. */
export function shouldJoinOpenWorkspace(data: RuntimeTerminalCreateRequestPayload): boolean {
  return (
    data.source !== 'runtime-session' &&
    Boolean(data.command) &&
    Boolean(data.launchAgent || data.launchToken) &&
    !data.targetGroupId &&
    !data.afterTabId &&
    // A split pane inherits its tab's shell, so a shell choice needs its own tab.
    !data.shellOverride
  )
}

/** Splits the new agent into the worktree's open terminal tab; null means open a tab as before. */
export function joinAgentIntoOpenWorkspace(
  store: AppState,
  worktreeId: string,
  data: RuntimeTerminalCreateRequestPayload,
  focusNewPane: boolean
): AgentJoinResult | null {
  if (!data.command || !shouldJoinOpenWorkspace(data)) {
    return null
  }
  const target = selectAgentJoinSplitTarget(store, worktreeId)
  if (!target) {
    return null
  }
  const leafId = createBrowserUuid()
  routeRuntimeTerminalSplitRequest({
    tabId: target.tabId,
    worktreeId,
    // Ignored when sourceLeafId resolves; the durable leaf is the split authority.
    paneRuntimeId: -1,
    direction: target.direction,
    command: data.command,
    startup: {
      command: data.command,
      ...(data.cwd ? { cwd: data.cwd } : {}),
      ...(data.env ? { env: data.env } : {}),
      ...(data.envToDelete ? { envToDelete: data.envToDelete } : {}),
      ...(data.launchConfig ? { launchConfig: data.launchConfig } : {}),
      ...(data.resumeProviderSession ? { resumeProviderSession: data.resumeProviderSession } : {}),
      ...(data.launchToken ? { launchToken: data.launchToken } : {}),
      ...(data.launchAgent ? { launchAgent: data.launchAgent } : {}),
      ...(data.viewMode ? { viewMode: data.viewMode } : {}),
      ...(data.startupCommandDelivery
        ? { startupCommandDelivery: data.startupCommandDelivery }
        : {})
    },
    sourceLeafId: target.leafId,
    telemetrySource: 'command',
    newLeafId: leafId,
    // Why: a background worker must not take the active pane or keyboard from the user.
    ...(focusNewPane ? {} : { activate: false })
  })
  return { tabId: target.tabId, leafId }
}
