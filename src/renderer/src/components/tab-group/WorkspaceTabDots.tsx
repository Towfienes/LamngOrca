import { useState } from 'react'
import { CLOSE_TERMINAL_PANE_EVENT, type CloseTerminalPaneDetail } from '@/constants/terminal'
import { useAppStore } from '@/store'
import { FileText, Globe, Smartphone, TerminalSquare, X, type LucideIcon } from 'lucide-react'
import { AgentIcon } from '@/lib/agent-catalog'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { focusTerminalTabSurface } from '@/lib/focus-terminal-tab-surface'
import { runtimeEnvironmentIdOrLocalUnlessTwin } from '@/lib/worktree-runtime-owner'
import { activateStructuredAgentSessionTab } from '@/lib/agent-session/structured-agent-session-tab-activation'
import { activateWebRuntimeSessionTab } from '@/runtime/web-runtime-session-tab-lifecycle'
import { isWebRuntimeSessionActive } from '@/runtime/web-runtime-session-environment'
import {
  WORKSPACE_EMPTY_SLOTS,
  createWorkspaceTabDotsSelector,
  selectTabDotsHostGroupId,
  type WorkspaceTabDot
} from '@/lib/workspace-tab-dots'
import type { TerminalPaneLayoutNode } from '../../../../shared/terminal-tab-types'

// Why: the memoized selector returns the same array until a dots input changes, so terminal output never re-renders the strip.
function useWorkspaceTabDots(worktreeId: string): readonly WorkspaceTabDot[] {
  const [select] = useState(createWorkspaceTabDotsSelector)
  return useAppStore((state) => select(state, worktreeId))
}

// Mirrors the tab-strip click commands (useTabGroupActivationCommands) for the tab's content type.
function activateDotTab(worktreeId: string, dot: WorkspaceTabDot, leafId?: string): void {
  const state = useAppStore.getState()
  const tab = state.unifiedTabsByWorktree[worktreeId]?.find((candidate) => candidate.id === dot.id)
  if (!tab) {
    return
  }
  if (tab.contentType === 'agent-session') {
    activateStructuredAgentSessionTab({ worktreeId, tabId: tab.id })
    return
  }
  state.focusGroup(worktreeId, tab.groupId)
  state.activateTab(tab.id)
  if (tab.contentType === 'terminal') {
    const runtimeEnvironmentId = runtimeEnvironmentIdOrLocalUnlessTwin(state, worktreeId)
    if (isWebRuntimeSessionActive(runtimeEnvironmentId)) {
      void activateWebRuntimeSessionTab({
        worktreeId,
        tabId: tab.entityId,
        environmentId: runtimeEnvironmentId
      })
    }
    state.setActiveTab(tab.entityId)
    state.setActiveTabType('terminal', worktreeId)
    focusTerminalTabSurface(
      tab.entityId,
      leafId ?? state.terminalLayoutsByTabId?.[tab.entityId]?.activeLeafId ?? null
    )
  } else if (tab.contentType === 'browser') {
    state.setActiveBrowserTab(tab.entityId)
    state.setActiveTabType('browser', worktreeId)
  } else if (tab.contentType === 'simulator') {
    state.setActiveTabType('simulator', worktreeId)
  } else {
    state.setActiveFile(tab.entityId)
    state.setActiveTabType('editor', worktreeId)
  }
}

function describeDot(dot: WorkspaceTabDot): string {
  const panes = `${dot.paneCount} ${dot.paneCount === 1 ? 'pane' : 'panes'}`
  const status =
    dot.attention === 'waiting'
      ? ', waiting for input'
      : dot.attention === 'running'
        ? ', agent running'
        : ''
  return `${dot.title}, ${panes}${status}`
}

const CONTENT_ICONS: Partial<Record<WorkspaceTabDot['contentType'], LucideIcon>> = {
  terminal: TerminalSquare,
  browser: Globe,
  simulator: Smartphone
}

/** The pane icon under the pointer, when the dot draws one icon per pane. */
function paneLeafAt(target: EventTarget): string | undefined {
  return target instanceof Element
    ? (target.closest<HTMLElement>('[data-dot-pane-leaf]')?.dataset.dotPaneLeaf ?? undefined)
    : undefined
}

// Closes one pane by its durable leaf; the last pane closing takes its tab with it.
function closeDotPane(tabId: string, leafId: string): void {
  window.dispatchEvent(
    new CustomEvent<CloseTerminalPaneDetail>(CLOSE_TERMINAL_PANE_EVENT, {
      detail: { tabId, leafId }
    })
  )
}

function DotGlyphs({ dot }: { dot: WorkspaceTabDot }): React.JSX.Element {
  if (dot.panes.length < 2) {
    return <DotGlyph dot={dot} />
  }
  return (
    <>
      {dot.panes.map((pane) => (
        <span
          key={pane.leafId}
          className="deck-tab-dot-pane"
          data-dot-pane-leaf={pane.leafId}
          data-attention={pane.attention ?? undefined}
        >
          {pane.agent ? (
            <AgentIcon agent={pane.agent} size={12} />
          ) : (
            <TerminalSquare className="size-3" aria-hidden />
          )}
        </span>
      ))}
    </>
  )
}

function DotGlyph({ dot }: { dot: WorkspaceTabDot }): React.JSX.Element {
  if (dot.agent) {
    return <AgentIcon agent={dot.agent} size={12} />
  }
  const Icon = CONTENT_ICONS[dot.contentType] ?? FileText
  return <Icon className="size-3" aria-hidden />
}

function PaneMiniLayout({ node }: { node: TerminalPaneLayoutNode }): React.JSX.Element {
  if (node.type === 'leaf') {
    return <div className="deck-tab-preview-pane" />
  }
  return (
    <div className="deck-tab-preview-split" data-direction={node.direction}>
      <PaneMiniLayout node={node.first} />
      <PaneMiniLayout node={node.second} />
    </div>
  )
}

function TabPreview({ dot, index }: { dot: WorkspaceTabDot; index: number }): React.JSX.Element {
  const root = useAppStore((state) =>
    dot.previewTabId ? (state.terminalLayoutsByTabId?.[dot.previewTabId]?.root ?? null) : null
  )
  return (
    <>
      <div className="deck-tab-preview-canvas" aria-hidden>
        {root ? <PaneMiniLayout node={root} /> : <div className="deck-tab-preview-pane" />}
      </div>
      <div className="deck-tab-preview-title">
        <span className="deck-tab-preview-number">{index + 1}</span>
        <span className="truncate">{dot.title}</span>
        <span className="deck-tab-preview-count">
          · {dot.paneCount} {dot.paneCount === 1 ? 'pane' : 'panes'}
        </span>
      </div>
    </>
  )
}

/** One dot per tab of the active group plus empty slots (Hyprland-style workspaces); drawn once, in the first group's strip. */
export function WorkspaceTabDots({
  worktreeId,
  groupId,
  onNewWorkspace,
  onCloseTab
}: {
  worktreeId: string
  groupId: string | undefined
  onNewWorkspace: () => void
  /** Unified tab id; dots replace the text strip, so they carry its close action. */
  onCloseTab: (tabId: string) => void
}): React.JSX.Element | null {
  const dots = useWorkspaceTabDots(worktreeId)
  const hostGroupId = useAppStore((state) => selectTabDotsHostGroupId(state, worktreeId))
  if (dots.length === 0 || hostGroupId !== groupId) {
    return null
  }
  return (
    <div className="deck-tab-dots" role="group" aria-label="Workspace tabs">
      {dots.map((dot, index) => (
        <HoverCard key={dot.id} openDelay={120} closeDelay={60}>
          <HoverCardTrigger asChild>
            <button
              type="button"
              className="deck-tab-dot"
              data-active={dot.active ? 'true' : undefined}
              data-attention={dot.attention ?? undefined}
              aria-current={dot.active ? 'true' : undefined}
              aria-label={describeDot(dot)}
              onClick={(event) => activateDotTab(worktreeId, dot, paneLeafAt(event.target))}
              // Middle click closes the pane icon under the pointer, else the whole workspace.
              onAuxClick={(event) => {
                if (event.button !== 1) {
                  return
                }
                event.preventDefault()
                const leafId = paneLeafAt(event.target)
                if (leafId && dot.previewTabId) {
                  closeDotPane(dot.previewTabId, leafId)
                } else {
                  onCloseTab(dot.id)
                }
              }}
            >
              <DotGlyphs dot={dot} />
            </button>
          </HoverCardTrigger>
          <HoverCardContent side="bottom" align="start" sideOffset={6}>
            <div className="deck-tab-preview">
              <TabPreview dot={dot} index={index} />
              <button
                type="button"
                className="deck-tab-preview-close"
                aria-label={`Close ${dot.title}`}
                onClick={() => onCloseTab(dot.id)}
              >
                <X className="size-3" aria-hidden />
                Close
              </button>
            </div>
          </HoverCardContent>
        </HoverCard>
      ))}
      {Array.from({ length: WORKSPACE_EMPTY_SLOTS }, (_, slot) => (
        <button
          key={`empty-${slot}`}
          type="button"
          className="deck-tab-dot"
          data-empty="true"
          aria-label={`New workspace ${dots.length + slot + 1}`}
          title="New workspace"
          onClick={onNewWorkspace}
        />
      ))}
    </div>
  )
}
