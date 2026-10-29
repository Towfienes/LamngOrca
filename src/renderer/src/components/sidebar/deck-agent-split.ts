import { useAppStore } from '@/store'
import { buildAgentStartupPlan } from '@/lib/tui-agent-startup'
import { resolveAgentLaunchExecutionContext } from '@/lib/launch-agent-execution-context'
import { getRuntimeEnvironmentIdForWorktree } from '@/lib/worktree-runtime-owner'
import { callRuntimeRpc, type RuntimeClientTarget } from '@/runtime/runtime-rpc-client'
import { captureRuntimeEnvironmentRequestRevision } from '@/runtime/runtime-environment-revision'
import { toHostSessionTabId } from '@/runtime/web-terminal-surface-id'
import { activateTabAndFocusPane } from '@/lib/activate-tab-and-focus-pane'
import { paneIsCoveredByNativeChat } from '@/components/terminal-pane/native-chat-covered-pane'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import { AGENT_LAUNCH_ACCOUNT_ENV } from '../../../../shared/agent-launch-account'
import { FOCUS_TERMINAL_PANE_EVENT, type FocusTerminalPaneDetail } from '@/constants/terminal'
import type { WorktreeStartupLaunch } from '../../../../shared/worktree/launch-types'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type {
  RuntimeTerminalResolvePane,
  RuntimeTerminalSplit
} from '../../../../shared/runtime-terminal-contracts'
import {
  resolveTuiAgentLaunchArgs,
  resolveTuiAgentLaunchEnv
} from '../../../../shared/tui-agent-launch-defaults'

export type DeckAgentSplitTarget = {
  tabId: string
  leafId: string
  direction: 'vertical' | 'horizontal'
}

export function resolveDeckAgentSplitTarget(
  worktreeId: string,
  hoveredPane: HTMLElement | null
): DeckAgentSplitTarget | null {
  const state = useAppStore.getState()
  const tabs = state.tabsByWorktree[worktreeId] ?? []
  const panes = [...document.querySelectorAll<HTMLElement>('.pane[data-leaf-id]')].filter(
    (pane) => {
      const tabId = pane.closest<HTMLElement>('[data-terminal-tab-id]')?.dataset.terminalTabId
      return (
        pane.checkVisibility({ visibilityProperty: true }) &&
        !paneIsCoveredByNativeChat({ container: pane }) &&
        tabs.some((tab) => tab.id === tabId)
      )
    }
  )
  const activeLeaf = state.activeTabId
    ? state.terminalLayoutsByTabId[state.activeTabId]?.activeLeafId
    : null
  const pane =
    (hoveredPane && panes.includes(hoveredPane) ? hoveredPane : null) ??
    panes.find((entry) => entry.dataset.leafId === activeLeaf) ??
    panes[0]
  const tabId = pane?.closest<HTMLElement>('[data-terminal-tab-id]')?.dataset.terminalTabId
  const leafId = pane?.dataset.leafId
  if (!pane || !tabId || !leafId) {
    return null
  }
  const { width, height } = pane.getBoundingClientRect()
  return { tabId, leafId, direction: width >= height ? 'vertical' : 'horizontal' }
}

export async function launchDeckAgentInPane(
  worktreeId: string,
  pane: DeckAgentSplitTarget,
  agent: TuiAgent,
  launch?: {
    accountId?: string
    commandOverride?: string
    startup?: WorktreeStartupLaunch
  }
): Promise<void> {
  const state = useAppStore.getState()
  const context = resolveAgentLaunchExecutionContext(state, { worktreeId })
  if (!context) {
    return
  }
  const environmentId = getRuntimeEnvironmentIdForWorktree(state, worktreeId)
  if (launch?.accountId && (context.isRemote || environmentId)) {
    throw new Error('Launch accounts on the host that owns this workspace.')
  }
  const target: RuntimeClientTarget = environmentId
    ? { kind: 'environment', environmentId }
    : { kind: 'local' }
  const options = environmentId
    ? {
        expectedEnvironmentPairingRevision: captureRuntimeEnvironmentRequestRevision(environmentId)
      }
    : {}
  const startup = launch?.startup
    ? null
    : buildAgentStartupPlan({
        agent,
        prompt: '',
        allowEmptyPromptLaunch: true,
        cmdOverrides: state.settings?.agentCmdOverrides ?? {},
        agentArgs: resolveTuiAgentLaunchArgs(agent, state.settings?.agentDefaultArgs),
        agentEnv: {
          ...resolveTuiAgentLaunchEnv(agent, state.settings?.agentDefaultEnv),
          ...(launch?.accountId ? { [AGENT_LAUNCH_ACCOUNT_ENV]: launch.accountId } : {})
        },
        platform: context.resolvedLaunchPlatform,
        shell: context.queuedShell,
        isRemote: context.isRemote || Boolean(environmentId)
      })
  if (!startup && !launch?.startup) {
    throw new Error('Could not build the agent launch command.')
  }
  // The host resolves the durable leaf; a closed pane must never fall back to a sibling.
  const { terminal } = await callRuntimeRpc<{ terminal: RuntimeTerminalResolvePane }>(
    target,
    'terminal.resolvePane',
    {
      paneKey: makePaneKey(toHostSessionTabId(pane.tabId), pane.leafId),
      worktreeId
    },
    options
  )
  const { split } = await callRuntimeRpc<{ split: RuntimeTerminalSplit }>(
    target,
    'terminal.split',
    {
      terminal: terminal.handle,
      direction: pane.direction,
      ...(launch?.startup ?? {
        command: launch?.commandOverride ?? startup?.launchCommand,
        ...(startup?.launchConfig && !launch?.commandOverride
          ? { launchConfig: startup.launchConfig }
          : {}),
        ...(startup?.env ? { env: startup.env } : {})
      }),
      launchAgent: agent,
      telemetrySource: 'context_menu'
    },
    options
  )
  const current = useAppStore.getState()
  if (
    current.activeWorktreeId === worktreeId &&
    current.activeTabId === pane.tabId &&
    split.leafId
  ) {
    activateTabAndFocusPane(pane.tabId, split.leafId)
    // The reveal reply already confirms this leaf is mounted, including in hidden renderers.
    if (typeof window !== 'undefined') {
      const detail: FocusTerminalPaneDetail = { tabId: pane.tabId, leafId: split.leafId }
      window.dispatchEvent(new CustomEvent(FOCUS_TERMINAL_PANE_EVENT, { detail }))
    }
  }
}
