import type { SleepingAgentLaunchConfig } from '../../shared/agent-session-resume'
import type { TuiAgent } from '../../shared/tui-agent'
import { copySleepingAgentLaunchConfig } from './runtime-agent-launch-resolution'
import type { RuntimePtyWorktreeRecord } from './runtime-terminal-state-records'

export type PtyLaunchStamp = {
  title?: string
  launchConfig?: SleepingAgentLaunchConfig
  launchToken?: string
  launchAgent?: TuiAgent
}

/** Records a fresh spawn's title and launch identity on its PTY; an adopted pane keeps its own. */
export function stampFreshPtyLaunch(
  pty: RuntimePtyWorktreeRecord,
  launch: PtyLaunchStamp,
  titles: {
    nextObservation: () => number
    setManagementTitle: (pty: RuntimePtyWorktreeRecord, title: string, observedAt: number) => void
  }
): void {
  if (launch.title) {
    const observedAt = titles.nextObservation()
    pty.title = launch.title
    pty.titleUpdatedAt = observedAt
    titles.setManagementTitle(pty, launch.title, observedAt)
  } else {
    pty.title = null
    pty.titleUpdatedAt = null
  }
  pty.launchConfig = launch.launchConfig ? copySleepingAgentLaunchConfig(launch.launchConfig) : null
  pty.launchToken = launch.launchToken ?? null
  pty.launchIncarnationId = launch.launchToken ? pty.incarnationId : null
  pty.launchAgent = launch.launchAgent ?? null
}
