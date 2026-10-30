import React, { useCallback, useLayoutEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '@/store'
import DashboardAgentRow from '@/components/dashboard/DashboardAgentRow'
import { useNow } from '@/hooks/use-now'
import { deriveRunningAgentSendTargets } from '@/lib/running-agent-targets'
import {
  selectSendTargetControlInputs,
  selectSendTargetInputs
} from './worktree-card-send-target-inputs'
import { useWorktreeAgentRows } from './useWorktreeAgentRows'
import { cn } from '@/lib/utils'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { useFocusedAgentPaneKey } from './focused-agent-row-highlight'
import {
  CompactAgentExpansion,
  CompactAgentRow,
  CompactAgentSummaryButton
} from './worktree-card-compact-agents'
import { buildAgentRowLineageTree } from '@/components/dashboard/agent-row-lineage-model'
import { DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE } from '../../../../shared/constants'
import { revealElementInScrollContainer } from './worktree-sidebar-reveal'
import { useWorktreeAgentExpansionState } from './worktree-card-agents-expansion-state'
import { translate } from '@/i18n/i18n'
import { toast } from 'sonner'
import { closeSidebarAgentPane } from './close-sidebar-agent-pane'
import {
  activateRetainedSidebarAgentRow,
  activateSidebarAgentTab
} from './sidebar-agent-tab-activation'
import { SidebarSubagentBadge } from './SidebarSubagentBadge'
import { useUiLanguageRevision } from '@/i18n/use-ui-language-revision'
import { selectAgentRowsUnread } from './worktree-card-agent-ack-inputs'

export const SUPPRESS_WORKTREE_LIST_SCROLL_ADJUSTMENT_EVENT =
  'orca-suppress-worktree-list-scroll-adjustment'

const dispatchSuppressScrollAdjustment = () => {
  window.dispatchEvent(new CustomEvent(SUPPRESS_WORKTREE_LIST_SCROLL_ADJUSTMENT_EVENT))
}

function revealCompactAgentCard(agentListRoot: HTMLElement | null): void {
  const sidebarElement = agentListRoot?.closest('[data-worktree-sidebar]')
  const worktreeOptionElement = agentListRoot?.closest('[role="option"]')
  if (!(sidebarElement instanceof HTMLElement) || !worktreeOptionElement) {
    return
  }
  revealElementInScrollContainer(sidebarElement, worktreeOptionElement, 'auto')
}

type Props = {
  worktreeId: string
  agents?: DashboardAgentRowData[]
  className?: string
}

const WorktreeCardAgents = React.memo(function WorktreeCardAgents({
  worktreeId,
  agents: precomputedAgents,
  className
}: Props) {
  useUiLanguageRevision()
  const selectedAgents = useWorktreeAgentRows(worktreeId, precomputedAgents === undefined)
  const agents = precomputedAgents ?? selectedAgents
  if (agents.length === 0) {
    return null
  }
  // Only non-empty bodies mount the 30s clock, avoiding timer cost for idle worktrees.
  return <WorktreeCardAgentsBody worktreeId={worktreeId} agents={agents} className={className} />
})

type BodyProps = {
  worktreeId: string
  agents: DashboardAgentRowData[]
  className?: string
}

const WorktreeCardAgentsBody = React.memo(function WorktreeCardAgentsBody({
  worktreeId,
  agents,
  className
}: BodyProps) {
  useUiLanguageRevision()
  const agentActivityDisplayMode =
    useAppStore((s) => s.agentActivityDisplayMode) ?? DEFAULT_AGENT_ACTIVITY_DISPLAY_MODE
  const dropAgentStatus = useAppStore((s) => s.dropAgentStatus)
  const dismissRetainedAgent = useAppStore((s) => s.dismissRetainedAgent)
  const { targetMode: agentSendPopoverTargetMode, agentStatusEpoch } = useAppStore(
    useShallow((s) => selectSendTargetControlInputs(s, worktreeId))
  )
  // Use a stable empty selector outside our send popover so unrelated title/status churn cannot wake idle cards.
  const sendTargetInputs = useAppStore(useShallow((s) => selectSendTargetInputs(s, worktreeId)))
  const sendPromptToSidebarAgentTarget = useAppStore((s) => s.sendPromptToSidebarAgentTarget)
  const focusedAgentPaneKey = useFocusedAgentPaneKey(worktreeId)
  const compactAgentListRootRef = useRef<HTMLDivElement | null>(null)

  // Project global acknowledgement state onto this card’s rows to avoid rerenders from other worktrees.
  const agentRowsUnread = useAppStore(useShallow((s) => selectAgentRowsUnread(s, agents)))
  const unvisitedByPaneKey = useMemo(() => {
    const out: Record<string, boolean> = {}
    for (const [index, agent] of agents.entries()) {
      out[agent.paneKey] = agentRowsUnread[index] ?? false
    }
    return out
  }, [agents, agentRowsUnread])

  const handleDismissAgent = useCallback(
    (paneKey: string) => {
      const agent = agents.find((row) => row.paneKey === paneKey)
      if (agent?.rowSource === 'retained') {
        dropAgentStatus(paneKey)
        dismissRetainedAgent(paneKey)
        return
      }
      void closeSidebarAgentPane(worktreeId, paneKey)
        .then(() => {
          dropAgentStatus(paneKey, { paneRemoved: true })
          dismissRetainedAgent(paneKey)
        })
        .catch((error: unknown) => {
          toast.error(error instanceof Error ? error.message : 'Could not close the agent pane.')
        })
    },
    [agents, worktreeId, dropAgentStatus, dismissRetainedAgent]
  )

  const isAgentSendTargetModeActive = agentSendPopoverTargetMode !== null
  const sendTargetsByPaneKey = useMemo(() => {
    void agentStatusEpoch
    if (!isAgentSendTargetModeActive) {
      return new Map<
        string,
        { status: 'eligible' | 'disabled' | 'sending'; disabledReason?: string }
      >()
    }

    return new Map(
      deriveRunningAgentSendTargets(sendTargetInputs, worktreeId).map((target) => [
        target.paneKey,
        agentSendPopoverTargetMode?.status === 'sending' &&
        agentSendPopoverTargetMode.sendingPaneKey === target.paneKey
          ? { status: 'sending' as const, disabledReason: 'Sending...' }
          : target.disabledReason
            ? { status: target.status, disabledReason: target.disabledReason }
            : { status: target.status }
      ])
    )
  }, [
    // Freshness timers advance this epoch without replacing the status map.
    agentStatusEpoch,
    agentSendPopoverTargetMode?.sendingPaneKey,
    agentSendPopoverTargetMode?.status,
    isAgentSendTargetModeActive,
    sendTargetInputs,
    worktreeId
  ])

  const handleSendTargetClick = useCallback(
    (paneKey: string) => {
      void sendPromptToSidebarAgentTarget(paneKey)
    },
    [sendPromptToSidebarAgentTarget]
  )

  const handleActivateAgentTab = useCallback(
    (tabId: string, paneKey: string) => activateSidebarAgentTab(worktreeId, tabId, paneKey),
    [worktreeId]
  )
  const handleActivateRetainedAgent = useCallback(
    (tabId: string, paneKey: string) => activateRetainedSidebarAgentRow(worktreeId, tabId, paneKey),
    [worktreeId]
  )

  const now = useNow(30_000)
  const { rootRows: rootAgents, childrenByParentPaneKey } = useMemo(
    () => buildAgentRowLineageTree(agents),
    [agents]
  )
  const hasLineage = childrenByParentPaneKey.size > 0
  // Persist disclosure outside component state so virtualizer/sibling-triggered remounts cannot reset it.
  const {
    collapsedLineageParents,
    compactRootListExpanded,
    toggleLineageParent: toggleLineageParentState,
    toggleCompactRootList
  } = useWorktreeAgentExpansionState(worktreeId)

  // Reveal only user expansion; restoring cached expansion on remount must not scroll again.
  const previousCompactExpandedRef = useRef(compactRootListExpanded)
  useLayoutEffect(() => {
    const wasExpanded = previousCompactExpandedRef.current
    previousCompactExpandedRef.current = compactRootListExpanded
    if (!wasExpanded && compactRootListExpanded && agentActivityDisplayMode === 'compact') {
      dispatchSuppressScrollAdjustment()
      // Defer reveal one frame to avoid synchronous sidebar layout during the opening animation.
      const handle = requestAnimationFrame(() => {
        revealCompactAgentCard(compactAgentListRootRef.current)
      })
      return () => cancelAnimationFrame(handle)
    }
    return undefined
  }, [agentActivityDisplayMode, compactRootListExpanded])
  const toggleLineageParent = useCallback(
    (paneKey: string) => {
      dispatchSuppressScrollAdjustment()
      toggleLineageParentState(paneKey)
    },
    [toggleLineageParentState]
  )

  const stopBubble = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
  }, [])

  const renderAgentBranch = (
    agent: DashboardAgentRowData,
    ancestorPaneKeys: ReadonlySet<string> = new Set()
  ): React.ReactNode => {
    if (ancestorPaneKeys.has(agent.paneKey)) {
      // External lineage metadata may cycle; reject repeated ancestors before recursion.
      return null
    }
    const childRows = childrenByParentPaneKey.get(agent.paneKey) ?? []
    const subagents = childRows.filter((row) => row.rowSource === 'subagent')
    const childAgents = childRows.filter((row) => row.rowSource !== 'subagent')
    const hasChildAgents = childAgents.length > 0
    const expanded = !collapsedLineageParents.has(agent.paneKey)
    const sendTarget = isAgentSendTargetModeActive
      ? (sendTargetsByPaneKey.get(agent.paneKey) ?? {
          status: 'disabled' as const,
          disabledReason: translate(
            'auto.components.sidebar.WorktreeCardAgents.agentUnavailable',
            'Agent is not available'
          )
        })
      : undefined
    const descendantAncestorPaneKeys = new Set(ancestorPaneKeys)
    descendantAncestorPaneKeys.add(agent.paneKey)
    return (
      <React.Fragment key={agent.paneKey}>
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1">
            <DashboardAgentRow
              rail
              agent={agent}
              onDismiss={handleDismissAgent}
              onActivate={
                agent.rowSource === 'retained'
                  ? handleActivateRetainedAgent
                  : handleActivateAgentTab
              }
              now={now}
              // Why: bold the row until the user visits its tab (useAutoAckViewedAgent auto-acks on focus, muting it).
              isUnvisited={unvisitedByPaneKey[agent.paneKey] ?? false}
              // Why: inline rows are tight; 'md' reads as a second glyph users confuse with the adjacent identity icon, so use 'sm'.
              stateDotSize="sm"
              // Why: clicking the row jumps straight to the agent, so the expand chevron is redundant (keep the identity glyph).
              hideExpand
              // Why: child expansion belongs to the parent agent row.
              childAgentCount={hasChildAgents ? childAgents.length : undefined}
              childAgentsExpanded={expanded}
              onToggleChildAgents={
                hasChildAgents ? () => toggleLineageParent(agent.paneKey) : undefined
              }
              isFocusedPane={agent.paneKey === focusedAgentPaneKey}
              sendTargetStatus={sendTarget?.status}
              sendTargetDisabledReason={sendTarget?.disabledReason}
              onSendTargetClick={isAgentSendTargetModeActive ? handleSendTargetClick : undefined}
              // Why: hierarchy shows via chevron + indent; legacy L-connectors use a fixed offset that mismatches the column and reads as floating fragments.
              hideLineageConnectors
            />
          </div>
          <SidebarSubagentBadge
            parent={agent}
            activeChildren={subagents}
            now={now}
            onActivate={
              agent.rowSource === 'retained' ? handleActivateRetainedAgent : handleActivateAgentTab
            }
          />
        </div>
        {hasChildAgents && expanded ? (
          <div className="worktree-agent-lineage-children">
            {childAgents.map((childAgent) =>
              renderAgentBranch(childAgent, descendantAncestorPaneKeys)
            )}
          </div>
        ) : null}
      </React.Fragment>
    )
  }

  const renderCompactAgentBranch = (
    agent: DashboardAgentRowData,
    ancestorPaneKeys: ReadonlySet<string> = new Set(),
    cacheTimerActive = true
  ): React.ReactNode => {
    if (ancestorPaneKeys.has(agent.paneKey)) {
      return null
    }
    const childRows = childrenByParentPaneKey.get(agent.paneKey) ?? []
    const subagents = childRows.filter((row) => row.rowSource === 'subagent')
    const childAgents = childRows.filter((row) => row.rowSource !== 'subagent')
    const hasChildAgents = childAgents.length > 0
    const expanded = !collapsedLineageParents.has(agent.paneKey)
    const sendTarget = isAgentSendTargetModeActive
      ? (sendTargetsByPaneKey.get(agent.paneKey) ?? {
          status: 'disabled' as const,
          disabledReason: translate(
            'auto.components.sidebar.WorktreeCardAgents.agentUnavailable',
            'Agent is not available'
          )
        })
      : undefined
    const descendantAncestorPaneKeys = new Set(ancestorPaneKeys)
    descendantAncestorPaneKeys.add(agent.paneKey)
    return (
      <React.Fragment key={agent.paneKey}>
        <div className="flex min-w-0 items-center gap-1">
          <div className="min-w-0 flex-1">
            <CompactAgentRow
              agent={agent}
              now={now}
              isUnvisited={unvisitedByPaneKey[agent.paneKey] ?? false}
              onActivate={
                agent.rowSource === 'retained'
                  ? handleActivateRetainedAgent
                  : handleActivateAgentTab
              }
              sendTargetStatus={sendTarget?.status}
              sendTargetDisabledReason={sendTarget?.disabledReason}
              onSendTargetClick={isAgentSendTargetModeActive ? handleSendTargetClick : undefined}
              childAgentCount={hasChildAgents ? childAgents.length : undefined}
              childAgentsExpanded={expanded}
              onToggleChildAgents={
                hasChildAgents ? () => toggleLineageParent(agent.paneKey) : undefined
              }
              isFocusedPane={agent.paneKey === focusedAgentPaneKey}
              cacheTimerActive={cacheTimerActive}
            />
          </div>
          <SidebarSubagentBadge
            parent={agent}
            activeChildren={subagents}
            now={now}
            onActivate={
              agent.rowSource === 'retained' ? handleActivateRetainedAgent : handleActivateAgentTab
            }
          />
        </div>
        {hasChildAgents ? (
          <CompactAgentExpansion expanded={expanded}>
            <div className="worktree-agent-lineage-children flex flex-col gap-0.5">
              {childAgents.map((childAgent) =>
                renderCompactAgentBranch(
                  childAgent,
                  descendantAncestorPaneKeys,
                  cacheTimerActive && expanded
                )
              )}
            </div>
          </CompactAgentExpansion>
        ) : null}
      </React.Fragment>
    )
  }

  if (agentActivityDisplayMode === 'compact') {
    const summaryAgents = hasLineage ? rootAgents : agents
    // Collapse compact multi-agent lists except when their rows are the send-target picker.
    const shouldUseSummaryRow = summaryAgents.length > 1 && !isAgentSendTargetModeActive
    const subjectLabel = `${hasLineage ? rootAgents.length : agents.length} agents`

    return (
      <div
        ref={compactAgentListRootRef}
        className={cn('flex flex-col mt-1 gap-0.5', className)}
        onClick={stopBubble}
        onDoubleClick={stopBubble}
        onMouseDown={stopBubble}
        onPointerDown={stopBubble}
        role={hasLineage ? 'tree' : 'group'}
        aria-label={translate('auto.components.sidebar.WorktreeCardAgents.1b0a156717', 'Agents')}
        data-compact-agent-list="true"
      >
        {agents.length === 0 ? null : shouldUseSummaryRow ? (
          <div
            className={cn(
              'compact-agent-summary-panel',
              compactRootListExpanded && 'compact-agent-summary-panel-expanded'
            )}
          >
            <CompactAgentSummaryButton
              agents={summaryAgents}
              subjectLabel={subjectLabel}
              expanded={compactRootListExpanded}
              onToggle={() => {
                dispatchSuppressScrollAdjustment()
                toggleCompactRootList()
              }}
            />
            <CompactAgentExpansion expanded={compactRootListExpanded}>
              {rootAgents.map((rootAgent) =>
                renderCompactAgentBranch(rootAgent, new Set(), compactRootListExpanded)
              )}
            </CompactAgentExpansion>
          </div>
        ) : (
          rootAgents.map((rootAgent) => renderCompactAgentBranch(rootAgent))
        )}
      </div>
    )
  }

  return (
    // Gutter clicks must not bubble into card activation or metadata editing.
    <div
      className={cn('flex flex-col mt-1', className)}
      onClick={stopBubble}
      onDoubleClick={stopBubble}
      onMouseDown={stopBubble}
      onPointerDown={stopBubble}
      role={hasLineage ? 'tree' : 'group'}
      aria-label={translate('auto.components.sidebar.WorktreeCardAgents.1b0a156717', 'Agents')}
    >
      {rootAgents.map((rootAgent) => renderAgentBranch(rootAgent))}
    </div>
  )
})

export default WorktreeCardAgents
