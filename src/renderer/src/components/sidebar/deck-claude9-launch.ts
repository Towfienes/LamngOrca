import { useAppStore } from '@/store'
import { isWindowsDesktopClient } from '@/lib/windows-path-access'
import { resolveTuiAgentLaunchArgs } from '../../../../shared/agent-launch/choices/tui-agent-launch-defaults'
import type { AiVaultSession } from '../../../../shared/ai-vault/contracts/ai-vault-types'
import { resolveAiVaultTargetWorkspacePath } from '../right-sidebar/ai-vault/session-actions/ai-vault-session-launch-target'
import { launchDeckAccountAgent } from './deck-account-agent-launch'
import type { DeckAgentSplitTarget } from './deck-agent-split'
import { buildClaudeRouterCommand } from './deck-router-launch'

/**
 * The `claude9` command line: its default 9router model plus Claude's default launch args,
 * optionally resuming a session.
 */
export function buildClaude9Command(
  defaultArgs: string,
  resume?: { sessionId: string; cwd: string | null; workspacePath: string | null },
  windows = isWindowsDesktopClient()
): string {
  return buildClaudeRouterCommand('claude9', defaultArgs, resume, windows)
}

export function formatTokenCount(n: number | null): string {
  if (!n) {
    return '—'
  }
  return n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}k`
}

/**
 * Opens claude9 (new or resumed) as a Claude tab or in the hovered pane; /model picks the model.
 * Why: claude9 brings its own config dir and 9router auth, so it skips Orca's account and
 * session steps; `claude9` is not matched as a Claude launch, so Orca injects no account auth.
 */
export async function launchClaude9Tab(
  worktreeId: string,
  groupId: string,
  pane: DeckAgentSplitTarget | null,
  session?: AiVaultSession
): Promise<string> {
  const state = useAppStore.getState()
  const command = buildClaude9Command(
    resolveTuiAgentLaunchArgs('claude', state.settings),
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

/** claude9 history for the Deck session picker (kept outside Orca's Claude history roots). */
export function loadClaude9Sessions(): Promise<AiVaultSession[]> {
  return window.api.claude9.sessions()
}
