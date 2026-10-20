import {
  AGENT_LAUNCH_ACCOUNT_ENV,
  findClaudeTranscriptAccount
} from '../../../shared/agent-launch-account'
import type { ClaudeManagedAccount } from '../../../shared/managed-account-types'

export function claudeResumeAccountEnv(args: {
  agent: string
  agentEnv: Record<string, string>
  transcriptPath?: string
  accounts?: readonly ClaudeManagedAccount[]
  local: boolean
}): Record<string, string> {
  if (!args.local || args.agent !== 'claude' || args.agentEnv[AGENT_LAUNCH_ACCOUNT_ENV]) {
    return args.agentEnv
  }
  const account = findClaudeTranscriptAccount(args.accounts, args.transcriptPath)
  return account ? { ...args.agentEnv, [AGENT_LAUNCH_ACCOUNT_ENV]: account.id } : args.agentEnv
}
