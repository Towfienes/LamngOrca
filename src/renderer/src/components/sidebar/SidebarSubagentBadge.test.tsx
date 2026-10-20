// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DashboardAgentRow } from '../dashboard/useDashboardData'
import { TooltipProvider } from '../ui/tooltip'
import { SidebarSubagentBadge } from './SidebarSubagentBadge'
import { buildSubagentChildRows } from './worktree-subagent-child-rows'

const now = 100_000
function parentRow(): DashboardAgentRow {
  return {
    paneKey: 'parent-tab:parent-leaf',
    agentType: 'codex',
    state: 'working',
    startedAt: 1,
    tab: {
      id: 'parent-tab',
      worktreeId: 'wt',
      ptyId: null,
      title: 'Codex',
      customTitle: null,
      color: null,
      sortOrder: 0,
      createdAt: 1
    },
    entry: {
      paneKey: 'parent-tab:parent-leaf',
      tabId: 'parent-tab',
      worktreeId: 'wt',
      state: 'working',
      prompt: 'Parent',
      updatedAt: now,
      stateStartedAt: 1,
      stateHistory: [],
      children: [
        {
          id: 'live',
          kind: 'agent',
          name: 'default',
          state: 'working',
          membership: 'live',
          observedAt: now,
          firstObservedAt: 1,
          stoppable: false,
          invocation: { invocationId: 'fixture-invocation', generation: 1 }
        },
        {
          id: 'done',
          kind: 'agent',
          description: 'Review complete',
          state: 'done',
          membership: 'settled',
          outcome: 'succeeded',
          observedAt: now,
          firstObservedAt: 1,
          settledAt: now,
          stoppable: false,
          invocation: { invocationId: 'fixture-invocation', generation: 1 }
        }
      ]
    }
  }
}
afterEach(cleanup)
function mount(parent = parentRow()) {
  const activeChildren = buildSubagentChildRows({
    parentEntry: parent.entry,
    tab: parent.tab,
    parentIsFresh: true
  })
  const onActivate = vi.fn()
  render(
    <TooltipProvider>
      <SidebarSubagentBadge
        parent={parent}
        activeChildren={activeChildren}
        now={now}
        onActivate={onActivate}
      />
    </TooltipProvider>
  )
  return { onActivate }
}
describe('SidebarSubagentBadge', () => {
  it('keeps details unmounted until opened and counts only active children', async () => {
    const { onActivate } = mount()
    expect(screen.queryByRole('region', { name: 'Subagent details' })).toBeNull()
    const badge = screen.getByRole('button', { name: 'Subagents: 1 active, 1 completed' })
    expect(badge.textContent).toContain('↳ 1')
    fireEvent.click(badge)
    await screen.findByRole('region', { name: 'Subagent details' })
    expect(screen.getByText('default')).toBeTruthy()
    const summary = screen.getByText('Completed (1)')
    expect(summary.closest('details')?.open).toBe(false)
    fireEvent.click(screen.getByText('default').closest('button')!)
    expect(onActivate).toHaveBeenCalledWith('parent-tab', 'parent-tab:parent-leaf')
  })
  it('retains completed child evidence for the details view without adding sidebar rows', async () => {
    const parent = parentRow()
    parent.entry.children = parent.entry.children?.filter((row) => row.membership === 'settled')
    mount(parent)
    fireEvent.click(screen.getByRole('button', { name: 'Subagents: 0 active, 1 completed' }))
    await screen.findByRole('region', { name: 'Subagent details' })
    expect(screen.getByText('No active subagents')).toBeTruthy()
    expect(screen.getByText('Review complete')).toBeTruthy()
  })
  it('opens on keyboard activation and closes with Escape', async () => {
    mount()
    const badge = screen.getByRole('button', { name: 'Subagents: 1 active, 1 completed' })
    fireEvent.focus(badge)
    fireEvent.click(badge)
    await screen.findByRole('region', { name: 'Subagent details' })
    fireEvent.keyDown(badge, { key: 'Escape' })
    expect(badge.getAttribute('aria-expanded')).toBe('false')
  })
})
