import {
  getAgentResumeArgv,
  type AgentProviderSessionMetadata,
  type ResumableTuiAgent
} from './agent-session-resume'
import type { SessionOptionValue } from './native-chat-session-options'
import { buildSleepingAgentLaunchConfig } from './sleeping-agent-launch-config'
import { resolveAgentLaunchCommand } from './tui-agent-launch-command'
import type { AgentStartupPlan } from './tui-agent-startup'
import { resolveStartupShell, type AgentStartupShell } from './tui-agent-startup-shell'
import { TUI_AGENT_CONFIG } from './tui-agent-config'
import type { TuiAgent } from './tui-agent'
import { buildAgentResumeLaunchCommand } from './agent-resume-launch-command'
import { isClaude9TranscriptPath } from './claude9-models'

export function buildAgentResumeStartupPlan(args: {
  agent: ResumableTuiAgent
  providerSession: AgentProviderSessionMetadata
  cmdOverrides: Partial<Record<TuiAgent, string>>
  platform: NodeJS.Platform
  shell?: AgentStartupShell
  agentArgs?: string | null
  agentEnv?: Record<string, string> | null
  agentCommand?: string | null
  ompResumeFilePath?: string | null
  sessionOptions?: Record<string, SessionOptionValue>
  sessionOptionsOverrideAgentArgs?: boolean
  isRemote?: boolean
}): AgentStartupPlan | null {
  const argv = getAgentResumeArgv(args.agent, args.providerSession, args.ompResumeFilePath)
  if (!argv) {
    return null
  }
  const shell = resolveStartupShell(args.platform, args.shell)
  // Why: claude9 panes report Claude hooks, but their transcripts live in claude9's own config
  // dir; `claude --resume` there fails with "No conversation found".
  const claude9Command =
    args.agent === 'claude' && isClaude9TranscriptPath(args.providerSession.transcriptPath)
      ? ['claude9', args.agentArgs?.trim()].filter(Boolean).join(' ')
      : null
  const resolvedAgentCommand = claude9Command ?? args.agentCommand?.trim()
  const baseCommand = resolvedAgentCommand
    ? ({
        ok: true,
        command: resolvedAgentCommand,
        commandWithoutSessionOptions: resolvedAgentCommand,
        appliedSessionOptions: {}
      } as const)
    : resolveAgentLaunchCommand({
        agent: args.agent,
        cmdOverrides: args.cmdOverrides,
        platform: args.platform,
        shell,
        agentArgs: args.agentArgs,
        sessionOptions: args.sessionOptions,
        sessionOptionsOverrideAgentArgs: args.sessionOptionsOverrideAgentArgs,
        isRemote: args.isRemote
      })
  if (!baseCommand.ok) {
    return null
  }
  const launchConfig = buildSleepingAgentLaunchConfig({
    ...args,
    agentCommand: baseCommand.commandWithoutSessionOptions
  })
  const launchCommand = buildAgentResumeLaunchCommand(args.agent, baseCommand.command, argv, shell)
  const applied = baseCommand.appliedSessionOptions
  return {
    agent: args.agent,
    launchCommand,
    expectedProcess: TUI_AGENT_CONFIG[args.agent].expectedProcess,
    followupPrompt: null,
    launchConfig,
    ...(args.agent === 'codex' ? { startupCommandDelivery: 'shell-ready' as const } : {}),
    ...(Object.keys(applied).length > 0 ? { sessionOptions: { ...applied } } : {}),
    ...(args.agentEnv ? { env: { ...args.agentEnv } } : {})
  }
}
