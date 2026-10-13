import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { FolderPlus, GitBranch, Plus } from 'lucide-react'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { QuickLaunchAgentMenuItems } from '../tab-bar/QuickLaunchButton'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { openWorkspaceCreationComposerWithTourHandoff } from '../contextual-tours/workspace-creation-tour-handoff'
import {
  launchDeckAgentInPane,
  resolveDeckAgentSplitTarget,
  type DeckAgentSplitTarget
} from './deck-agent-split'

export function DeckCreateBar(): React.JSX.Element {
  const openModal = useAppStore((s) => s.openModal)
  const worktreeId = useAppStore((s) => s.activeWorktreeId)
  const groupId = useAppStore((s) =>
    worktreeId ? s.activeGroupIdByWorktree[worktreeId] : undefined
  )
  const pendingTab = useRef<string | null>(null)
  const hoveredPane = useRef<HTMLElement | null>(null)
  const [splitTarget, setSplitTarget] = useState<DeckAgentSplitTarget | null>(null)
  const [launching, setLaunching] = useState(false)

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
      <Button variant="outline" size="xs" onClick={openWorkspaceCreationComposerWithTourHandoff}>
        <GitBranch className="size-3" /> Worktree
      </Button>
      <Button variant="outline" size="xs" onClick={() => openModal('add-repo')}>
        <FolderPlus className="size-3" /> Folder
      </Button>
      <DropdownMenu
        onOpenChange={(open) => {
          if (open && worktreeId) {
            setSplitTarget(resolveDeckAgentSplitTarget(worktreeId, hoveredPane.current))
          }
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button size="xs" disabled={!worktreeId || !groupId || launching} aria-label="New agent">
            <Plus className="size-3.5" /> Agent
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          onCloseAutoFocus={(event) => {
            const tabId = pendingTab.current
            pendingTab.current = null
            if (tabId) {
              event.preventDefault()
              focusTerminalTabSurface(tabId)
            }
          }}
        >
          {worktreeId && groupId ? (
            <QuickLaunchAgentMenuItems
              worktreeId={worktreeId}
              groupId={groupId}
              onLaunchAgent={
                splitTarget
                  ? (agent) => {
                      setLaunching(true)
                      void launchDeckAgentInPane(worktreeId, splitTarget, agent)
                        .catch((error: unknown) =>
                          toast.error(
                            error instanceof Error ? error.message : 'Could not launch the agent.'
                          )
                        )
                        .finally(() => setLaunching(false))
                    }
                  : undefined
              }
              onFocusTerminal={(tabId) => {
                pendingTab.current = tabId
              }}
            />
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
