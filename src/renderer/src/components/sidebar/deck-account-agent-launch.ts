import { useAppStore } from '@/store'
import { buildAgentStartupPlan } from '@/lib/tui-agent-startup'
import { resolveAgentLaunchExecutionContext } from '@/lib/launch-agent-execution-context'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { AGENT_LAUNCH_ACCOUNT_ENV } from '../../../../shared/agent-launch-account'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../../shared/tui-agent-launch-defaults'
import type { TuiAgent } from '../../../../shared/tui-agent'
import {
  launchDeckAgentInPane,
  resolveDeckAgentSplitTarget,
  type DeckAgentSplitTarget
} from './deck-agent-split'

export type DeckAccountAgent = Extract<TuiAgent, 'claude' | 'codex' | 'antigravity'>

/** Whether a quick-slot agent first picks an account; the rest open session history directly. */
export function deckAgentHasAccountStep(agent: TuiAgent): boolean {
  return (
    agent === 'claude' ||
    agent === 'claude-agent-teams' ||
    agent === 'codex' ||
    agent === 'antigravity'
  )
}

export function deckAccountLaunchIsLocal(worktreeId: string): boolean {
  const state = useAppStore.getState()
  const context = resolveAgentLaunchExecutionContext(state, { worktreeId })
  return (
    !context.isRemote &&
    context.worktreeSshConnectionId !== undefined &&
    !getRuntimeEnvironmentIdForWorktree(state, worktreeId) &&
    !(context.resolvedLaunchPlatform === 'linux' && navigator.userAgent.includes('Windows'))
  )
}

export async function launchDeckAccountAgent(
  worktreeId: string,
  groupId: string,
  agent: TuiAgent,
  accountId?: string,
  commandOverride?: string,
  pane?: DeckAgentSplitTarget | null
): Promise<string> {
  const state = useAppStore.getState()
  if (!deckAccountLaunchIsLocal(worktreeId)) {
    throw new Error('Launch accounts on the host that owns this workspace.')
  }
  const split = pane ?? resolveDeckAgentSplitTarget(worktreeId, null)
  if (split) {
    await launchDeckAgentInPane(worktreeId, split, agent, { accountId, commandOverride })
    return split.tabId
  }
  const context = resolveAgentLaunchExecutionContext(state, { worktreeId })
  const startup = buildAgentStartupPlan({
    agent,
    prompt: '',
    allowEmptyPromptLaunch: true,
    cmdOverrides: state.settings?.agentCmdOverrides ?? {},
    agentArgs: resolveTuiAgentLaunchArgs(agent, state.settings?.agentDefaultArgs),
    agentEnv: {
      ...resolveTuiAgentLaunchEnv(agent, state.settings?.agentDefaultEnv),
      ...(accountId ? { [AGENT_LAUNCH_ACCOUNT_ENV]: accountId } : {})
    },
    platform: context.resolvedLaunchPlatform,
    shell: context.queuedShell,
    isRemote: false
  })
  if (!startup) {
    throw new Error('Could not build the agent launch command.')
  }
  const tab = state.createTab(worktreeId, groupId, undefined, {
    launchAgent: agent,
    viewMode: 'terminal',
    pendingStartup: {
      command: commandOverride ?? startup.launchCommand,
      launchAgent: agent,
      startupCommandDelivery: 'shell-ready',
      ...(startup.launchConfig && !commandOverride ? { launchConfig: startup.launchConfig } : {}),
      ...(startup.env ? { env: startup.env } : {})
    }
  })
  state.setActiveTab(tab.id)
  state.setActiveTabType('terminal', worktreeId)
  return tab.id
}
