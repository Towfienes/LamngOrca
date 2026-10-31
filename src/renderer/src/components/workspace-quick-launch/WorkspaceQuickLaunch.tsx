import { useRef, useState } from 'react'
import { useWorkspaceLaunchReadiness } from './use-workspace-launch-readiness'
import { QuickLaunchOrbit } from './QuickLaunchOrbit'
import { ArrowDown, ArrowUp, Folder, GitBranch, Plus, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { useWorkspaceLaunchSelection } from '@/store/workspace-launch-selection'
import { AgentIcon, getAgentCatalog, getAgentLabel } from '@/lib/agent-catalog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Separator } from '@/components/ui/separator'
import { DeckCreateBar } from '@/components/sidebar/DeckCreateBar'
import { useAgentDetectionTargetForWorktree } from '@/hooks/useAgentDetectionTarget'
import { useNewTabAgentMenuRows } from '@/components/tab-bar/use-new-tab-agent-menu-rows'
import { getClientCreationActionPolicy } from '@/lib/client-creation-action-policy'
import { openMobileEmulatorTab } from '@/lib/open-mobile-emulator-tab'
import { basename } from '@/lib/path'
import { translate } from '@/i18n/i18n'
import {
  normalizeWorkspaceQuickLaunch,
  type QuickLaunchTool,
  type WorkspaceQuickLaunch
} from '../../../../shared/workspace-quick-launch'

import { TOOL_ICONS, toolLabel } from './quick-launch-tools'
import { useVSCodeEditorAvailability } from '../editor/use-vscode-editor-availability'

export function WorkspaceQuickLaunch({
  worktreeId,
  path,
  branch,
  newWorkspace = false
}: {
  worktreeId: string
  path: string
  branch?: string
  newWorkspace?: boolean
}): React.JSX.Element {
  const saved = useAppStore((s) => s.settings?.workspaceQuickLaunch)
  const mobileEnabled = useAppStore((s) => s.settings?.mobileEmulatorEnabled !== false)
  const groupId = useAppStore((s) => s.activeGroupIdByWorktree[worktreeId])
  const preferences = normalizeWorkspaceQuickLaunch(saved)
  const target = useAgentDetectionTargetForWorktree(worktreeId)
  const vscodeReady = useVSCodeEditorAvailability()
  const model = useNewTabAgentMenuRows(worktreeId, true, target)
  const { inventory, retry } = useWorkspaceLaunchReadiness(worktreeId, newWorkspace)
  const [busy, setBusy] = useState(false)
  const actionPending = useRef(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [customizing, setCustomizing] = useState(false)
  const policy = getClientCreationActionPolicy(useAppStore.getState(), worktreeId)

  const save = async (next: WorkspaceQuickLaunch) => {
    if (saving) {
      return
    }
    setSaving(true)
    try {
      await useAppStore.getState().updateSettingsOrThrow({ workspaceQuickLaunch: next })
    } catch {
      toast.error(translate('quickLaunch.saveFailed', 'Could not save Quick Launch. Try again.'))
    } finally {
      setSaving(false)
    }
  }
  const runTool = async (tool: QuickLaunchTool) => {
    if (!groupId || actionPending.current) {
      return
    }
    actionPending.current = true
    setBusy(true)
    try {
      const state = useAppStore.getState()
      if (state.activeWorktreeId !== worktreeId) {
        return
      }
      if (tool === 'vscode') {
        state.openModal('quick-open')
        return
      } else if (tool === 'terminal') {
        await state.openNewTerminalTabInActiveWorkspace(groupId)
      } else if (tool === 'browser') {
        await state.openNewBrowserTabInActiveWorkspace(groupId)
      } else {
        await openMobileEmulatorTab(worktreeId, {
          targetGroupId: groupId,
          placement: 'activeGroup'
        })
      }
      useWorkspaceLaunchSelection.getState().dismiss(worktreeId)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      actionPending.current = false
      setBusy(false)
    }
  }
  const move = (kind: 'agents' | 'tools', index: number, delta: number) => {
    const other = index + delta
    if (other < 0 || other >= preferences[kind].length) {
      return
    }
    void save(
      kind === 'agents'
        ? {
            ...preferences,
            agents: preferences.agents.map(
              (_, i) => preferences.agents[i === index ? other : i === other ? index : i]!
            )
          }
        : {
            ...preferences,
            tools: preferences.tools.map(
              (_, i) => preferences.tools[i === index ? other : i === other ? index : i]!
            )
          }
    )
  }
  const unavailable = translate(
    'quickLaunch.unavailable',
    'Unavailable on this host. Check agent settings or connection.'
  )
  const canLaunch = inventory === 'empty' && Boolean(groupId) && !busy
  return (
    <section
      className="workspace-quick-launch scrollbar-sleek"
      aria-label={translate('quickLaunch.label', 'Quick Launch')}
      data-workspace-quick-launch
    >
      <div className="workspace-quick-launch-content">
        <QuickLaunchOrbit />
        <div
          className="flex flex-wrap justify-center items-center gap-3 text-sm text-muted-foreground"
          title={path}
        >
          <Folder className="size-4" />
          <span>{basename(path)}</span>
          {branch ? (
            <>
              <span>/</span>
              <GitBranch className="size-4" />
              <span>{branch}</span>
            </>
          ) : null}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {translate('quickLaunch.title', 'Start a session')}
        </h1>
        <p className="text-muted-foreground">
          {translate('quickLaunch.subtitle', 'Choose an agent or open a tool.')}
        </p>
        {inventory !== 'empty' ? (
          <div role="status" className="text-sm text-muted-foreground">
            {inventory === 'checking'
              ? translate('quickLaunch.checking', 'Checking existing sessions…')
              : translate('quickLaunch.blocked', 'Could not confirm this workspace is empty.')}
            {inventory === 'blocked' ? (
              <Button variant="ghost" onClick={retry}>
                {translate('quickLaunch.retry', 'Retry')}
              </Button>
            ) : null}
          </div>
        ) : null}
        <DeckCreateBar
          newWorkspace={newWorkspace}
          renderActions={(chooseAgent, launching) => (
            <div className="workspace-quick-launch-agents">
              {preferences.agents.map((agent) => {
                const available =
                  model.state === 'settled' &&
                  model.rows.some((row) => row.agent === agent && row.kind !== 'chat-unavailable')
                return (
                  <span key={agent} className="workspace-quick-launch-agent">
                    <Button
                      variant="ghost"
                      disabled={!canLaunch || launching || !available}
                      title={available ? getAgentLabel(agent) : unavailable}
                      onClick={() => chooseAgent(agent)}
                    >
                      <span className="workspace-quick-launch-logo">
                        <AgentIcon agent={agent} size={40} />
                      </span>
                      <span>{getAgentLabel(agent)}</span>
                    </Button>
                  </span>
                )
              })}
            </div>
          )}
        />
        {model.state === 'settled' && model.detection.detectionFailed ? (
          <p role="status" className="text-sm text-muted-foreground">
            {unavailable}
            <Button
              variant="ghost"
              onClick={() => void model.detection.refresh().catch(() => undefined)}
            >
              {translate('quickLaunch.retry', 'Retry')}
            </Button>
          </p>
        ) : null}
        <Separator />
        <div className="flex flex-wrap justify-center gap-3">
          {preferences.tools.map((tool) => {
            const Icon = TOOL_ICONS[tool]
            const availability =
              tool === 'browser'
                ? policy['managed-browser']
                : tool === 'emulator'
                  ? policy['mobile-emulator']
                  : null
            const disabled =
              !canLaunch ||
              (tool === 'vscode' && (!vscodeReady || target?.kind !== 'local')) ||
              (tool === 'emulator' && !mobileEnabled) ||
              availability?.state === 'hidden'
            return (
              <Button
                variant="ghost"
                key={tool}
                disabled={disabled}
                title={
                  tool === 'vscode'
                    ? !vscodeReady || target?.kind !== 'local'
                      ? translate(
                          'quickLaunch.vscodeUnavailable',
                          'The embedded VS Code editor requires a local workspace and an installed VS Code runtime.'
                        )
                      : translate(
                          'quickLaunch.vscodeOpen',
                          'Choose a workspace file to open in the embedded editor.'
                        )
                    : availability?.state === 'hidden'
                      ? availability.reason
                      : tool === 'emulator' && target?.kind !== 'local'
                        ? translate('quickLaunch.localEmulator', 'Emulator runs on this computer.')
                        : undefined
                }
                onClick={() => void runTool(tool)}
              >
                <Icon className="size-4" />
                {toolLabel(tool)}
              </Button>
            )
          })}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost">
                <Plus className="size-4" />
                {translate('quickLaunch.add', 'Add agent')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="flex flex-col gap-3">
                <Input
                  aria-label={translate('quickLaunch.search', 'Search agents')}
                  placeholder={translate('quickLaunch.search', 'Search agents')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <div className="max-h-64 overflow-y-auto scrollbar-sleek flex flex-col">
                  {getAgentCatalog()
                    .filter((agent) =>
                      agent.label.toLocaleLowerCase().includes(query.toLocaleLowerCase())
                    )
                    .map((agent) => (
                      <Button
                        key={agent.id}
                        variant="ghost"
                        disabled={saving || preferences.agents.includes(agent.id)}
                        onClick={() =>
                          void save({ ...preferences, agents: [...preferences.agents, agent.id] })
                        }
                      >
                        <AgentIcon agent={agent.id} />
                        {agent.label}
                        {preferences.agents.includes(agent.id) ? ' ✓' : ''}
                      </Button>
                    ))}
                </div>
                <Button
                  variant="ghost"
                  onClick={() => {
                    const state = useAppStore.getState()
                    state.openSettingsTarget({ pane: 'agents', repoId: null })
                    state.openSettingsPage()
                  }}
                >
                  {translate('quickLaunch.configure', 'Configure agents…')}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Popover open={customizing} onOpenChange={setCustomizing}>
            <PopoverTrigger asChild>
              <Button variant="ghost">
                <Settings2 className="size-4" />
                {translate('quickLaunch.customize', 'Customize')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="flex flex-col gap-3 max-h-80 overflow-y-auto scrollbar-sleek">
                <p className="text-xs text-muted-foreground">
                  {translate(
                    'quickLaunch.removeHint',
                    'Removing a shortcut keeps its agent and configuration.'
                  )}
                </p>
                {(['agents', 'tools'] as const).map((kind) => (
                  <div key={kind} className="flex flex-col gap-1">
                    <h2 className="text-sm font-semibold">
                      {kind === 'agents'
                        ? translate('quickLaunch.agents', 'Agents')
                        : translate('quickLaunch.tools', 'Tools')}
                    </h2>
                    {preferences[kind].map((id, index) => (
                      <div key={id} className="flex items-center gap-1">
                        <span className="text-sm flex-1 truncate">
                          {kind === 'agents'
                            ? getAgentLabel(preferences.agents[index]!)
                            : toolLabel(preferences.tools[index]!)}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={saving || index === 0}
                          aria-label={translate('quickLaunch.moveUp', 'Move {{name}} up', {
                            name: id
                          })}
                          onClick={() => move(kind, index, -1)}
                        >
                          <ArrowUp className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={saving || index === preferences[kind].length - 1}
                          aria-label={translate('quickLaunch.moveDown', 'Move {{name}} down', {
                            name: id
                          })}
                          onClick={() => move(kind, index, 1)}
                        >
                          <ArrowDown className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={saving}
                          onClick={() =>
                            void save(
                              kind === 'agents'
                                ? {
                                    ...preferences,
                                    agents: preferences.agents.filter((item) => item !== id)
                                  }
                                : {
                                    ...preferences,
                                    tools: preferences.tools.filter((item) => item !== id)
                                  }
                            )
                          }
                        >
                          {translate('quickLaunch.remove', 'Remove')}
                        </Button>
                      </div>
                    ))}
                  </div>
                ))}
                {(['terminal', 'vscode', 'browser', 'emulator'] as const)
                  .filter((tool) => !preferences.tools.includes(tool))
                  .map((tool) => (
                    <Button
                      key={tool}
                      variant="ghost"
                      disabled={saving}
                      onClick={() =>
                        void save({ ...preferences, tools: [...preferences.tools, tool] })
                      }
                    >
                      <Plus className="size-4" />
                      {toolLabel(tool)}
                    </Button>
                  ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <p className="text-sm text-muted-foreground">
          {translate('quickLaunch.scope', 'Opens in this workspace.')}
        </p>
      </div>
    </section>
  )
}
