import { useLayoutEffect, useState } from 'react'
import { getTerminalTabOwnerWorktreeId } from '@/store/slices/terminal-tab-owner-index'
import { useAppStore } from '@/store'
import {
  AGENT_LAUNCH_ACCOUNT_ENV,
  findClaudeTranscriptAccount
} from '../../../../shared/agent-launch-account'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import { agentProviderSessionsEqual } from '../../../../shared/agent-session-resume'
import { isRemoteExecutionHostPtyId } from '../../../../shared/remote-execution-host-pty-id'

export function usePaneAccountIdentity(paneKey: string) {
  const agent = useAppStore((state) => state.agentStatusByPaneKey[paneKey])
  const launch = useAppStore((state) => state.agentLaunchConfigByPaneKey[paneKey])
  const foreground = useAppStore((state) => state.paneForegroundAgentByPaneKey[paneKey])
  const recovery = useAppStore((state) => state.sleepingAgentSessionsByPaneKey[paneKey])
  const parsed = parsePaneKey(paneKey)
  const worktreeId = useAppStore((state) =>
    parsed ? getTerminalTabOwnerWorktreeId(state.tabsByWorktree ?? {}, parsed.tabId) : null
  )
  const savedPaneTitle = useAppStore((state) =>
    parsed ? state.terminalLayoutsByTabId[parsed.tabId]?.titlesByLeafId?.[parsed.leafId] : undefined
  )
  const ptyId = useAppStore((state) =>
    parsed
      ? (state.terminalLayoutsByTabId[parsed.tabId]?.ptyIdsByLeafId?.[parsed.leafId] ?? null)
      : null
  )
  const [pinned, setPinned] = useState<{
    ptyId: string
    accountId?: string
    accountLabel?: string
    agentType: string
    sessionId?: string
  } | null>(null)
  const launchAccountId = foreground?.shellForeground
    ? undefined
    : launch?.launchConfig.agentEnv[AGENT_LAUNCH_ACCOUNT_ENV]
  const currentAgentType = foreground?.shellForeground
    ? undefined
    : (agent?.agentType ?? launch?.identity.agentType ?? foreground?.agent ?? undefined)
  const matchingRecovery =
    recovery &&
    !foreground?.shellForeground &&
    (!currentAgentType || recovery.agent === currentAgentType) &&
    (agent?.providerSession
      ? agentProviderSessionsEqual(recovery.agent, recovery.providerSession, agent.providerSession)
      : Boolean(ptyId && recovery.ptyId === ptyId))
      ? recovery
      : undefined
  const retained =
    !foreground?.shellForeground &&
    pinned?.ptyId === ptyId &&
    (!agent?.providerSession?.id ||
      !pinned.sessionId ||
      pinned.sessionId === agent.providerSession.id) &&
    (!currentAgentType || pinned.agentType === currentAgentType)
      ? pinned
      : null
  const accountId =
    launchAccountId ??
    matchingRecovery?.launchConfig?.agentEnv[AGENT_LAUNCH_ACCOUNT_ENV] ??
    retained?.accountId
  const agentType = currentAgentType ?? matchingRecovery?.agent ?? retained?.agentType
  const resolvedAccountLabel = useAppStore((state) => {
    const accounts =
      agentType === 'codex'
        ? state.settings?.codexManagedAccounts
        : agentType === 'claude' || agentType === 'claude-agent-teams'
          ? state.settings?.claudeManagedAccounts
          : []
    if (accountId) {
      return accounts?.find((account) => account.id === accountId)?.email ?? null
    }
    const transcriptPath = (agent?.providerSession ?? matchingRecovery?.providerSession)
      ?.transcriptPath
    if (
      (agentType !== 'claude' && agentType !== 'claude-agent-teams') ||
      foreground?.shellForeground ||
      !transcriptPath ||
      !ptyId ||
      isRemoteExecutionHostPtyId(ptyId) ||
      agent?.connectionId ||
      matchingRecovery?.connectionId
    ) {
      return null
    }
    // Older panes lack launch account ids; their reported transcript still identifies its owner.
    return (
      findClaudeTranscriptAccount(state.settings?.claudeManagedAccounts, transcriptPath)?.email ??
      null
    )
  })
  const accountLabel =
    resolvedAccountLabel ??
    (!accountId || accountId === retained?.accountId ? retained?.accountLabel : undefined)
  const sessionId = agent?.providerSession?.id ?? matchingRecovery?.providerSession.id
  useLayoutEffect(() => {
    // Account presentation belongs to the PTY, while resume authorization expires after a turn.
    setPinned((previous) => {
      if (foreground?.shellForeground) {
        return null
      }
      if (ptyId && accountLabel && agentType) {
        return !foreground?.shellForeground &&
          previous?.ptyId === ptyId &&
          previous.accountId === accountId &&
          previous.accountLabel === accountLabel &&
          previous.sessionId === sessionId &&
          previous.agentType === agentType
          ? previous
          : { ptyId, accountId, accountLabel, agentType, sessionId }
      }
      return previous?.ptyId === ptyId && (!agentType || previous.agentType === agentType)
        ? previous
        : null
    })
  }, [ptyId, accountId, accountLabel, agentType, sessionId, foreground?.shellForeground])
  return {
    agent,
    launch,
    foreground,
    matchingRecovery,
    accountLabel,
    agentType,
    savedPaneTitle,
    worktreeId,
    ptyId
  }
}
