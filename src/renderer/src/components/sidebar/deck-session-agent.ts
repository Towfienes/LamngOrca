import { AI_VAULT_AGENTS, type AiVaultSession } from '../../../../shared/ai-vault-types'
import type { TuiAgent } from '../../../../shared/tui-agent'

export function getDeckSessionAgents(agent: TuiAgent) {
  const historyAgent = agent === 'claude-agent-teams' ? 'claude' : agent
  return AI_VAULT_AGENTS.filter(
    (id) => id === historyAgent || (historyAgent === 'opencode' && id === 'opencode2')
  )
}

export function getDeckSessionLaunchAgent(
  agent: TuiAgent,
  session: Pick<AiVaultSession, 'agent'> | undefined
): TuiAgent {
  return agent === 'opencode' && session?.agent === 'opencode2' ? 'opencode2' : agent
}
