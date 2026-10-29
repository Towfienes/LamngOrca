import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { FolderPlus, GitBranch, Plus, TerminalSquare } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { DeckAgentAccountPicker } from './DeckAgentAccountPicker'
import { DeckAgentSessionPicker } from './DeckAgentSessionPicker'
import { deckAccountLaunchIsLocal, deckAgentHasAccountStep } from './deck-account-agent-launch'
import { launchClaude9Tab, loadClaude9Sessions } from './deck-claude9-launch'
import { launchDeckAgentSession } from './deck-agent-session-launch'
import type { TuiAgent } from '../../../../shared/tui-agent'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { QuickLaunchAgentMenuItems } from '../tab-bar/QuickLaunchButton'
import {
  cancelPendingTerminalTabFocus,
  focusTerminalTabSurface
} from '@/lib/focus-terminal-tab-surface'
import { openWorkspaceCreationComposerWithTourHandoff } from '../contextual-tours/workspace-creation-tour-handoff'
import { resolveDeckAgentSplitTarget, type DeckAgentSplitTarget } from './deck-agent-split'
import { selectWorktreeRunningAgentsKey } from '@/lib/deck-agent-activity'

const QUICK_AGENTS = ['claude', 'codex', 'antigravity'] as const

export function DeckCreateBar(): React.JSX.Element {
  const openModal = useAppStore((s) => s.openModal)
  const worktreeId = useAppStore((s) => s.activeWorktreeId)
  const groupId = useAppStore((s) =>
    worktreeId ? s.activeGroupIdByWorktree[worktreeId] : undefined
  )
  // Why: a primitive key keeps the bar from re-rendering on unrelated agent status writes.
  const runningAgents = useAppStore((s) =>
    worktreeId ? selectWorktreeRunningAgentsKey(s, worktreeId) : ''
  )
  const pendingTab = useRef<string | null>(null)
  const hoveredPane = useRef<HTMLElement | null>(null)
  const [splitTarget, setSplitTarget] = useState<DeckAgentSplitTarget | null>(null)
  const [launching, setLaunching] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountAgent, setAccountAgent] = useState<TuiAgent | null>(null)
  const [chosenAccount, setChosenAccount] = useState<{ id?: string } | null>(null)
  const [claude9Step, setClaude9Step] = useState(false)
  const chooseAccountAgent = (agent: TuiAgent): void => {
    cancelPendingTerminalTabFocus()
    pendingTab.current = null
    if (worktreeId) {
      setSplitTarget(resolveDeckAgentSplitTarget(worktreeId, hoveredPane.current))
    }
    setMenuOpen(false)
    setAccountAgent(agent)
    setClaude9Step(false)
    setChosenAccount(deckAgentHasAccountStep(agent) ? null : {})
  }

  const openBlankTerminal = (): void => {
    if (!worktreeId || !groupId || launching) {
      return
    }
    void useAppStore
      .getState()
      .openNewTerminalTabInActiveWorkspace(groupId)
      .catch((error: unknown) =>
        toast.error(error instanceof Error ? error.message : 'Could not open a terminal.')
      )
  }

  const launchSession = async (session?: AiVaultSession, login = false): Promise<void> => {
    if (!accountAgent || !worktreeId || !groupId) {
      return
    }
    setLaunching(true)
    try {
      const tabId = await launchDeckAgentSession({
        agent: accountAgent,
        worktreeId,
        groupId,
        pane: splitTarget,
        accountId: chosenAccount?.id,
        session,
        login
      })
      setAccountAgent(null)
      const state = useAppStore.getState()
      if (
        !splitTarget &&
        tabId &&
        state.activeWorktreeId === worktreeId &&
        state.activeTabId === tabId
      ) {
        focusTerminalTabSurface(tabId)
      }
    } finally {
      setLaunching(false)
    }
  }

  // Why: errors reach the session picker, which shows them inline like other agents.
  const launchClaude9 = async (session?: AiVaultSession): Promise<void> => {
    if (!worktreeId || !groupId) {
      return
    }
    setLaunching(true)
    try {
      const tabId = await launchClaude9Tab(worktreeId, groupId, splitTarget, session)
      setAccountAgent(null)
      const state = useAppStore.getState()
      if (!splitTarget && state.activeWorktreeId === worktreeId && state.activeTabId === tabId) {
        focusTerminalTabSurface(tabId)
      }
    } finally {
      setLaunching(false)
    }
  }

  useEffect(() => {
    const rememberPane = (event: PointerEvent): void => {
      if (event.buttons !== 0 || !(event.target instanceof Element)) {
        return
      }
      const pane = event.target.closest<HTMLElement>('.pane[data-leaf-id]')
      if (pane) {
        hoveredPane.current = pane
      }
    }
    document.addEventListener('pointerover', rememberPane, true)
    return () => document.removeEventListener('pointerover', rememberPane, true)
  }, [])

  return (
    <div className="deck-create-bar" aria-label="Workspace actions">
      <Popover
        open={accountAgent !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAccountAgent(null)
          }
        }}
      >
        <PopoverAnchor asChild>
          <div className="deck-agent-actions">
            <div className="deck-dock-group" role="group" aria-label="Create">
              <div className="deck-dock-buttons">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      shape="circle"
                      aria-label="New worktree"
                      onClick={openWorkspaceCreationComposerWithTourHandoff}
                    >
                      <GitBranch className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">New worktree</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      shape="circle"
                      aria-label="Add folder"
                      onClick={() => openModal('add-repo')}
                    >
                      <FolderPlus className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">Add folder</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      shape="circle"
                      aria-label="New blank terminal"
                      disabled={!worktreeId || !groupId || launching}
                      onClick={openBlankTerminal}
                    >
                      <TerminalSquare className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">New blank terminal</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <span className="deck-dock-divider" aria-hidden />
            <div className="deck-dock-group" role="group" aria-label="Agents">
              <div className="deck-dock-buttons">
                {QUICK_AGENTS.map((agent) => {
                  const running = runningAgents.split(',').includes(agent)
                  return (
                    <span
                      key={agent}
                      className="deck-agent-quick-button"
                      data-running={running ? 'true' : undefined}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            shape="circle"
                            aria-label={`New ${getAgentLabel(agent)} session`}
                            disabled={!worktreeId || !groupId || launching}
                            onClick={() => chooseAccountAgent(agent)}
                          >
                            <AgentIcon agent={agent} size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          {getAgentLabel(agent)} ·{' '}
                          {deckAgentHasAccountStep(agent) ? 'Choose account' : 'Choose session'}
                          {running ? ' · running' : ''}
                        </TooltipContent>
                      </Tooltip>
                      {running ? <span className="deck-agent-running-dot" aria-hidden /> : null}
                    </span>
                  )
                })}
              </div>
            </div>
            <DropdownMenu
              open={menuOpen}
              onOpenChange={(open) => {
                setMenuOpen(open)
                if (open && worktreeId) {
                  setSplitTarget(resolveDeckAgentSplitTarget(worktreeId, hoveredPane.current))
                }
              }}
            >
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      shape="circle"
                      disabled={!worktreeId || !groupId || launching}
                      aria-label="New agent"
                    >
                      <Plus className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent side="bottom">New agent</TooltipContent>
              </Tooltip>
              <DropdownMenuContent
                align="end"
                onCloseAutoFocus={(event) => {
                  if (accountAgent) {
                    event.preventDefault()
                    return
                  }
                  const tabId = pendingTab.current
                  pendingTab.current = null
                  if (tabId) {
                    event.preventDefault()
                    focusTerminalTabSurface(tabId)
                  }
                }}
              >
                {worktreeId && groupId ? (
                  <>
                    <QuickLaunchAgentMenuItems
                      worktreeId={worktreeId}
                      groupId={groupId}
                      onChooseAccountAgent={chooseAccountAgent}
                      onLaunchAgent={chooseAccountAgent}
                      onFocusTerminal={(tabId) => {
                        pendingTab.current = tabId
                      }}
                    />
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={openBlankTerminal}>
                      <TerminalSquare className="size-4" /> Blank terminal
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="end"
          className="w-auto"
          onOpenAutoFocus={(event) => {
            if (event.target instanceof HTMLElement) {
              const account = event.target.querySelector<HTMLButtonElement>(
                '[aria-label="Launch account"] button[data-current="true"]'
              )
              if (account) {
                event.preventDefault()
                account.focus({ preventScroll: true })
              }
            }
          }}
          onCloseAutoFocus={(event) => {
            const tabId = pendingTab.current
            pendingTab.current = null
            if (tabId) {
              event.preventDefault()
              focusTerminalTabSurface(tabId)
            }
          }}
        >
          {accountAgent && worktreeId && groupId ? (
            accountAgent === 'claude' && claude9Step ? (
              <DeckAgentSessionPicker
                key="claude9"
                agent="claude"
                worktreeId={worktreeId}
                accountLabel="9router (claude9)"
                loadSessions={loadClaude9Sessions}
                onBack={() => setClaude9Step(false)}
                onLaunch={launchClaude9}
              />
            ) : chosenAccount !== null ? (
              <DeckAgentSessionPicker
                key={`${accountAgent}:${chosenAccount.id ?? 'default'}`}
                agent={accountAgent}
                worktreeId={worktreeId}
                accountLabel={
                  chosenAccount.id
                    ? ((accountAgent === 'claude' || accountAgent === 'claude-agent-teams'
                        ? useAppStore.getState().settings?.claudeManagedAccounts
                        : useAppStore.getState().settings?.codexManagedAccounts
                      )?.find((a) => a.id === chosenAccount.id)?.email ?? 'Chosen account')
                    : 'Workspace default account'
                }
                onBack={() => {
                  if (deckAgentHasAccountStep(accountAgent)) {
                    setChosenAccount(null)
                  } else {
                    setAccountAgent(null)
                  }
                }}
                onLaunch={launchSession}
              />
            ) : accountAgent === 'claude' ||
              accountAgent === 'claude-agent-teams' ||
              accountAgent === 'codex' ||
              accountAgent === 'antigravity' ? (
              <DeckAgentAccountPicker
                key={accountAgent}
                agent={accountAgent === 'claude-agent-teams' ? 'claude' : accountAgent}
                local={deckAccountLaunchIsLocal(worktreeId)}
                onClose={() => setAccountAgent(null)}
                onLaunchClaude9={accountAgent === 'claude' ? () => setClaude9Step(true) : undefined}
                onLaunch={(accountId, login) => {
                  if (login) {
                    void launchSession(undefined, true).catch((error: unknown) =>
                      toast.error(
                        error instanceof Error ? error.message : 'Could not open sign in.'
                      )
                    )
                  } else {
                    setChosenAccount({ id: accountId })
                  }
                }}
              />
            ) : null
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}
