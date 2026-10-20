import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { AgentStateDot, agentStateLabel } from '../AgentStateDot'
import type { DashboardAgentRow } from '../dashboard/useDashboardData'
import { getAgentDotState } from './worktree-card-agent-summary'
import { buildSubagentChildRows } from './worktree-subagent-child-rows'
import { isExplicitAgentStatusFresh } from '@/lib/agent-status'
import { AGENT_STATUS_STALE_AFTER_MS } from '../../../../shared/agent-status-types'

export function SidebarSubagentBadge({
  parent,
  activeChildren,
  now,
  onActivate
}: {
  parent: DashboardAgentRow
  activeChildren: DashboardAgentRow[]
  now: number
  onActivate: (tabId: string, paneKey: string) => void
}): React.JSX.Element | null {
  const [open, setOpen] = useState(false)
  const restoreFocus = useRef(false)
  const closeTimer = useRef<number | null>(null)
  const keepOpen = (): void => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
    }
    setOpen(true)
  }
  const closeSoon = (): void => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current)
    }
    closeTimer.current = window.setTimeout(() => setOpen(false), 120)
  }
  useEffect(
    () => () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current)
      }
    },
    []
  )
  const rows = useMemo(
    () =>
      buildSubagentChildRows({
        parentEntry: parent.entry,
        tab: parent.tab,
        parentIsFresh: isExplicitAgentStatusFresh(parent.entry, now, AGENT_STATUS_STALE_AFTER_MS),
        includeSettled: true
      }),
    [parent.entry, parent.tab, now]
  )
  if (rows.length === 0) {
    return null
  }
  const activeKeys = new Set(activeChildren.map((row) => row.paneKey))
  const completed = rows.filter((row) => !activeKeys.has(row.paneKey))
  const renderRow = (row: DashboardAgentRow): React.JSX.Element => {
    const state = getAgentDotState(row)
    const name = row.childRow?.name || row.entry.prompt || 'Subagent'
    return (
      <li key={row.paneKey}>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-sm p-1 text-left text-xs hover:bg-accent focus-visible:outline focus-visible:outline-ring"
          onClick={(event) => {
            event.stopPropagation()
            setOpen(false)
            onActivate(row.tab.id, row.activationPaneKey ?? row.paneKey)
          }}
        >
          <AgentStateDot state={state} size="sm" />
          <span className="min-w-0 flex-1 truncate" title={name}>
            {name}
          </span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {agentStateLabel(state)}
          </span>
        </button>
      </li>
    )
  }
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          aria-label={`Subagents: ${activeChildren.length} active, ${completed.length} completed`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            restoreFocus.current = true
            keepOpen()
          }}
          onPointerEnter={(event) => {
            if (event.pointerType !== 'touch') {
              restoreFocus.current = false
              keepOpen()
            }
          }}
          onPointerLeave={closeSoon}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Escape') {
              setOpen(false)
            }
          }}
        >
          <span aria-hidden>↳ {activeChildren.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="right"
        align="start"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
          if (!restoreFocus.current) {
            event.preventDefault()
          }
        }}
        onFocusCapture={() => {
          restoreFocus.current = true
        }}
        onPointerEnter={keepOpen}
        onPointerLeave={closeSoon}
      >
        <div
          className="max-h-64 space-y-2 overflow-y-auto scrollbar-sleek"
          role="region"
          aria-label="Subagent details"
        >
          <p className="text-xs font-medium">Subagents</p>
          {activeChildren.length > 0 ? (
            <ul className="space-y-1">{activeChildren.map(renderRow)}</ul>
          ) : (
            <p className="text-xs text-muted-foreground">No active subagents</p>
          )}
          {completed.length > 0 ? (
            <details>
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Completed ({completed.length})
              </summary>
              <ul className="mt-2 space-y-1">{completed.map(renderRow)}</ul>
            </details>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
