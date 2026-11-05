import type { TuiAgent } from '../../../../shared/agent-launch/catalog/tui-agent'
import type { LaunchSource } from '../../../../shared/telemetry-events'

export type QuickLaunchAgentMenuItemsProps = {
  onLaunchAgent?: (agent: TuiAgent) => void
  onChooseAccountAgent?: (agent: Extract<TuiAgent, 'claude' | 'codex' | 'antigravity'>) => void
  worktreeId: string
  groupId: string
  /** Reuse the tab bar’s focus handoff after creating a terminal tab. */
  onFocusTerminal: (tabId: string) => void
  /** Forward the initial prompt; delivery policy determines submission versus a user-confirmed draft. */
  prompt?: string
  /** Use non-default modes for generated context that must not become shell syntax. */
  promptDelivery?: 'auto-submit' | 'draft' | 'submit-after-ready'
  /** Default launch telemetry to tab_bar_quick_launch. */
  launchSource?: LaunchSource
  /** Called after a prompt is queued into the agent, or immediately for argv prompt launches. */
  onPromptDelivered?: () => void
  /** Given the launch's own delivery result while the prompt is still on its way. */
  onPromptHandedOff?: (delivered: Promise<unknown>) => void
  /** Nothing to send: e.g. every note is already on its way, so no agent is started. */
  disabled?: boolean
}
