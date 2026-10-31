import type { TuiAgent } from './tui-agent'
import { isTuiAgent } from './tui-agent-config'

export type QuickLaunchTool = 'terminal' | 'vscode' | 'browser' | 'emulator'
export type WorkspaceQuickLaunch = {
  version?: 2
  agents: TuiAgent[]
  tools: QuickLaunchTool[]
}
export type WorkspaceQuickLaunchSettings = { workspaceQuickLaunch?: WorkspaceQuickLaunch }

export function normalizeWorkspaceQuickLaunchUpdate(updates: object): WorkspaceQuickLaunchSettings {
  return 'workspaceQuickLaunch' in updates
    ? { workspaceQuickLaunch: normalizeWorkspaceQuickLaunch(updates.workspaceQuickLaunch) }
    : {}
}

export function normalizeWorkspaceQuickLaunch(value: unknown): WorkspaceQuickLaunch {
  const defaults: WorkspaceQuickLaunch = {
    version: 2,
    agents: ['claude', 'codex', 'opencode', 'antigravity', 'gemini', 'droid'],
    tools: ['terminal', 'vscode', 'browser', 'emulator']
  }
  if (!value || typeof value !== 'object') {
    return defaults
  }
  const agents = 'agents' in value ? value.agents : undefined
  const tools = 'tools' in value ? value.tools : undefined
  const normalizedTools: QuickLaunchTool[] = Array.isArray(tools)
    ? [
        ...new Set(
          tools.filter(
            (tool): tool is QuickLaunchTool =>
              tool === 'terminal' || tool === 'vscode' || tool === 'browser' || tool === 'emulator'
          )
        )
      ]
    : defaults.tools
  if (
    !('version' in value && value.version === 2) &&
    normalizedTools.length > 0 &&
    !normalizedTools.includes('vscode')
  ) {
    normalizedTools.splice(normalizedTools.indexOf('terminal') + 1, 0, 'vscode')
  }
  return {
    version: 2,
    agents: Array.isArray(agents) ? [...new Set(agents.filter(isTuiAgent))] : defaults.agents,
    tools: normalizedTools
  }
}
