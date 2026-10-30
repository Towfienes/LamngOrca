import { useAppStore } from '@/store'
import { activateAndRevealWorkspace } from '@/lib/worktree-activation'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { activateTerminalTabOnOwner } from '@/lib/terminal-tab-owner-activation'
import { activateStructuredAgentSessionTab } from '@/lib/agent-session/structured-agent-session-tab-activation'
import {
  structuredAgentSessionOwnerForTab,
  structuredAgentSessionTargetForTab
} from '@/runtime/structured-agent-session-owner'
import { stablePaneHasLivePty } from '@/lib/sleeping-agent-pane-ownership'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { getPtyExecutionHost } from '../../../../shared/terminal-execution-host'

/** 'no-live-pane': nothing left to open; Deck then selects the workspace instead. */
export type RetainedAgentRowActivation = 'activated' | 'no-live-pane' | 'refused'

export function activateRetainedAgentRow(
  worktreeId: string,
  tabId: string,
  paneKey: string
): RetainedAgentRowActivation {
  const parsed = parsePaneKey(paneKey)
  if (!parsed || parsed.tabId !== tabId) {
    return 'refused'
  }
  const state = useAppStore.getState()
  const nativeTab = state.unifiedTabsByWorktree[worktreeId]?.find(
    (tab) =>
      tab.id === tabId && tab.worktreeId === worktreeId && tab.contentType === 'agent-session'
  )
  const target = nativeTab ? structuredAgentSessionTargetForTab(state, nativeTab) : null
  const layout = state.terminalLayoutsByTabId[tabId]
  const hasLiveTerminal =
    state.tabsByWorktree[worktreeId]?.some((tab) => tab.id === tabId) &&
    stablePaneHasLivePty(tabId, parsed.leafId, state.ptyIdsByTabId, layout)
  const owner = nativeTab
    ? structuredAgentSessionOwnerForTab(state, nativeTab)
    : getPtyExecutionHost(
        layout?.ptyIdsByLeafId?.[parsed.leafId] ?? state.ptyIdsByTabId[tabId]?.[0]
      )
  if (owner === 'foreign') {
    return 'refused'
  }
  if (nativeTab ? !target : !hasLiveTerminal) {
    return 'no-live-pane'
  }
  // Verify an existing destination before workspace activation can resume sleeping panes.
  if (
    activateAndRevealWorkspace(worktreeId, owner ? { executionHostId: owner } : undefined) === false
  ) {
    return 'refused'
  }
  if (nativeTab && target) {
    activateStructuredAgentSessionTab({ worktreeId, tabId, target })
  } else {
    activateTabAndFocusPane(tabId, parsed.leafId, {
      ackPaneKeyOnSuccess: paneKey,
      flashFocusedPane: true,
      scrollToBottomIfOutputSinceLastView: true
    })
    activateTerminalTabOnOwner(worktreeId, tabId, parsed.leafId)
  }
  return 'activated'
}
