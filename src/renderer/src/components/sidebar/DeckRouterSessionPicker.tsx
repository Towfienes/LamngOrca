import { DeckAgentSessionPicker } from './DeckAgentSessionPicker'
import { loadClaude9Sessions } from './deck-claude9-launch'
import { loadDeeprelaySessions } from './deck-deeprelay-launch'
import type { AiVaultSession } from '../../../../shared/ai-vault/contracts/ai-vault-types'

export type DeckRouterStep = 'claude9' | 'deeprelay'

/** Session history for a Claude-format router launcher, each with its own profile dir. */
export function DeckRouterSessionPicker({
  step,
  worktreeId,
  onBack,
  onLaunch
}: {
  step: DeckRouterStep
  worktreeId: string
  onBack: () => void
  onLaunch: (step: DeckRouterStep, session?: AiVaultSession) => Promise<void>
}): React.JSX.Element {
  return (
    <DeckAgentSessionPicker
      key={step}
      agent="claude"
      worktreeId={worktreeId}
      accountLabel={step === 'claude9' ? '9router (claude9)' : 'DeepRelay (claude-dl)'}
      loadSessions={step === 'claude9' ? loadClaude9Sessions : loadDeeprelaySessions}
      onBack={onBack}
      onLaunch={(session) => onLaunch(step, session)}
    />
  )
}
