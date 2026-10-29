import type { AiVaultAgent } from './ai-vault-types'
import type { ExecutionHostId } from './execution-host'

export const AI_VAULT_SESSION_TITLE_REQUEST_MAX_COUNT = 64

export type AiVaultSessionTitle = {
  agent: Extract<AiVaultAgent, 'claude' | 'codex'>
  sessionId: string
  title: string
}

export type AiVaultSessionTitleRequest = {
  agent: AiVaultSessionTitle['agent']
  sessionId: string
  transcriptPath?: string
}

export type AiVaultSessionTitlesArgs = {
  executionHostScope?: ExecutionHostId
  requests: AiVaultSessionTitleRequest[]
}

export type AiVaultSessionTitlesResult = {
  titles: AiVaultSessionTitle[]
}

/** Session ids are provider-unique, so the agent + id pair names one session on any host. */
export function aiVaultSessionTitleKey(agent: string, sessionId: string): string {
  return `${agent}\0${sessionId}`
}

export function isAiVaultTitleAgent(
  agent: string | null | undefined
): agent is AiVaultSessionTitle['agent'] {
  return agent === 'claude' || agent === 'codex'
}
