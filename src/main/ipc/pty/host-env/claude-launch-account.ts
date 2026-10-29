import { AGENT_LAUNCH_ACCOUNT_ENV } from '../../../../shared/agent-launch-account'
import {
  CLAUDE_INJECTED_CONFIG_DIR_ENV,
  CLAUDE_PROFILE_POINTER_ENV,
  CLAUDE_USER_CONFIG_DIR_ENV
} from '../../../../shared/claude-profile-routing'

/** The Deck account a local Claude launch names, if any. */
export function pinnedClaudeLaunchAccount(args: {
  launchAgent?: string
  env?: Record<string, string | undefined>
  connectionId?: string | null
}): string | undefined {
  const accountId = args.env?.[AGENT_LAUNCH_ACCOUNT_ENV]
  const claude = args.launchAgent === 'claude' || args.launchAgent === 'claude-agent-teams'
  return accountId !== undefined && claude && !args.connectionId ? accountId : undefined
}

/** A pinned pane must not follow the selected-account pointer, so drop Orca's routing keys. */
export function withoutClaudeProfileRouting(
  env: Record<string, string> | undefined
): Record<string, string> | undefined {
  if (!env) {
    return env
  }
  const next = { ...env }
  const userConfigDir = next[CLAUDE_USER_CONFIG_DIR_ENV]
  if (
    next.CLAUDE_CONFIG_DIR !== undefined &&
    next.CLAUDE_CONFIG_DIR === next[CLAUDE_INJECTED_CONFIG_DIR_ENV]
  ) {
    if (userConfigDir) {
      next.CLAUDE_CONFIG_DIR = userConfigDir
    } else {
      delete next.CLAUDE_CONFIG_DIR
    }
  }
  delete next[CLAUDE_PROFILE_POINTER_ENV]
  delete next[CLAUDE_INJECTED_CONFIG_DIR_ENV]
  delete next[CLAUDE_USER_CONFIG_DIR_ENV]
  return next
}
