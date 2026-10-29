import { useAppStore } from '@/store'
import { getAgentRowConversationName } from '../../../../shared/agent-row-conversation-name'
import { aiVaultSessionTitleKey } from '../../../../shared/ai-vault-session-title'
import type { AgentType } from '../../../../shared/agent-status-types'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { resolveAgentRowPaneLiveTitle } from '@/components/dashboard/agent-row-pane-live-title'

/**
 * The pane header's session name, from the same resolver and per-session title store
 * the sidebar row uses, so the two never disagree. Undefined when only a neutral
 * label is honest.
 */
export function usePaneSessionTitle(
  paneKey: string,
  agentType: AgentType | null | undefined,
  providerSessionId: string | undefined,
  worktreeId: string | undefined,
  manualPaneTitle: string | undefined,
  recordedTitle?: string
): string | undefined {
  const parsed = parsePaneKey(paneKey)
  const tabId = parsed?.tabId
  const leafId = parsed?.leafId
  const tab = useAppStore((state) =>
    worktreeId && tabId
      ? state.tabsByWorktree?.[worktreeId]?.find((candidate) => candidate.id === tabId)
      : undefined
  )
  const paneLiveTitle = useAppStore((state) =>
    tabId
      ? resolveAgentRowPaneLiveTitle(
          state.terminalLayoutsByTabId?.[tabId],
          state.runtimePaneTitlesByTabId?.[tabId],
          leafId
        )
      : null
  )
  const providerSessionTitle = useAppStore((state) =>
    agentType && providerSessionId
      ? state.aiVaultSessionTitlesByKey?.[aiVaultSessionTitleKey(agentType, providerSessionId)]
      : undefined
  )
  if (!agentType) {
    return manualPaneTitle?.trim() || undefined
  }
  return (
    getAgentRowConversationName(
      tab ?? { customTitle: null, title: '' },
      agentType,
      paneLiveTitle,
      providerSessionId,
      { manualPaneTitle, providerSessionTitle, recordedTitle }
    ) ?? undefined
  )
}
