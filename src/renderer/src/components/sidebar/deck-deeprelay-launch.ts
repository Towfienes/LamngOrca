import { useAppStore } from '@/store'
import type { AiVaultSession } from '../../../../shared/ai-vault/contracts/ai-vault-types'
import { resolveAiVaultTargetWorkspacePath } from '../right-sidebar/ai-vault/session-actions/ai-vault-session-launch-target'
import { launchDeckAccountAgent } from './deck-account-agent-launch'
import type { DeckAgentSplitTarget } from './deck-agent-split'
import { buildClaudeRouterCommand } from './deck-router-launch'

/**
 * The `deeprelay` command line. No Claude launch args on purpose: the launcher already picks
 * its model, effort and permission mode from ~/.local/lib/deeprelay/env.json, and its default
 * `--dangerously-skip-permissions` conflicts with Orca's `--permission-mode auto`.
 */
export function buildDeeprelayCommand(
  resume?: { sessionId: string; cwd: string | null; workspacePath: string | null },
  windows?: boolean
): string {
  return buildClaudeRouterCommand('deeprelay', '', resume, windows)
}

/**
 * Opens DeepRelay (new or resumed) as a Claude tab or in the hovered pane; `/model` picks one
 * of the plan-covered models. Why: deeprelay brings its own profile and auth, so it skips
 * Orca's account and session steps, and `deeprelay` is not matched as a Claude launch.
 */
export async function launchDeeprelayTab(
  worktreeId: string,
  groupId: string,
  pane: DeckAgentSplitTarget | null,
  session?: AiVaultSession
): Promise<string> {
  const state = useAppStore.getState()
  const command = buildDeeprelayCommand(
    session
      ? {
          sessionId: session.sessionId,
          cwd: session.cwd,
          workspacePath: resolveAiVaultTargetWorkspacePath(state, worktreeId)
        }
      : undefined
  )
  return launchDeckAccountAgent(worktreeId, groupId, 'claude', undefined, command, pane)
}

/** DeepRelay history for the Deck session picker (kept outside Orca's Claude history roots). */
export function loadDeeprelaySessions(): Promise<AiVaultSession[]> {
  return window.api.deeprelay.sessions()
}
