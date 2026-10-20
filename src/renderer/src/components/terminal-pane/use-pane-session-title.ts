import { useEffect, useState } from 'react'
import { useAppStore } from '@/store'
import { isAiVaultTitleAgent } from '../../../../shared/ai-vault-session-title'
import type { AgentProviderSessionMetadata } from '../../../../shared/agent-session-resume'
import { getExecutionHostIdForWorktree } from '@/lib/worktree-runtime-owner'

export function usePaneSessionTitle(
  agent: string | undefined,
  providerSession: AgentProviderSessionMetadata | undefined,
  worktreeId: string | undefined,
  knownTitle: string | undefined
): string | undefined {
  const executionHostId = useAppStore((state) =>
    worktreeId ? getExecutionHostIdForWorktree(state, worktreeId) : undefined
  )
  const sessionId = providerSession?.id
  const transcriptPath = providerSession?.transcriptPath
  const identity = `${executionHostId}\0${agent}\0${sessionId}`
  const [resolved, setResolved] = useState<{ identity: string; title: string } | null>(null)
  useEffect(() => {
    if (
      knownTitle ||
      !isAiVaultTitleAgent(agent) ||
      !sessionId ||
      !executionHostId ||
      !window.api?.aiVault?.resolveSessionTitles
    ) {
      return
    }
    let cancelled = false
    void window.api.aiVault
      .resolveSessionTitles({
        executionHostScope: executionHostId,
        requests: [{ agent, sessionId, ...(transcriptPath ? { transcriptPath } : {}) }]
      })
      .then(({ titles }) => {
        const title = titles
          .find((entry) => entry.agent === agent && entry.sessionId === sessionId)
          ?.title.trim()
        if (!cancelled && title) {
          setResolved({ identity, title })
        }
      })
      .catch(() => {
        // Keep the saved title when the execution host is temporarily unavailable.
      })
    return () => {
      cancelled = true
    }
  }, [agent, sessionId, transcriptPath, executionHostId, identity, knownTitle])
  return knownTitle || (resolved?.identity === identity ? resolved.title : undefined)
}
