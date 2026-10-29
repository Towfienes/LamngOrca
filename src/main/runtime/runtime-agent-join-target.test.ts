import { describe, expect, it } from 'vitest'
import type { RuntimeMobileSessionTerminalTab } from '../../shared/runtime-mobile-session-tab-contracts'
import type { TerminalPaneLayoutNode } from '../../shared/terminal-tab-types'
import { selectSnapshotAgentJoinTarget, shouldJoinOpenWorkspace } from './runtime-agent-join-target'

const leaf = (leafId: string): TerminalPaneLayoutNode => ({ type: 'leaf', leafId })

const surface = (
  parentTabId: string,
  leafId: string,
  root: TerminalPaneLayoutNode | null,
  isActive = false
): RuntimeMobileSessionTerminalTab => ({
  type: 'terminal',
  id: `${parentTabId}::${leafId}`,
  title: 'Terminal',
  parentTabId,
  leafId,
  isActive,
  ...(root ? { parentLayout: { root, activeLeafId: leafId, expandedLeafId: null } } : {})
})

describe('shouldJoinOpenWorkspace', () => {
  const agent = { command: 'claude', launchAgent: 'claude' as const }

  it('joins agent launches that name no pane, tab group or shell', () => {
    expect(shouldJoinOpenWorkspace(agent)).toBe(true)
    expect(shouldJoinOpenWorkspace({ command: 'codex', launchToken: 't' })).toBe(true)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only presence of launchConfig is read.
    expect(shouldJoinOpenWorkspace({ command: 'claude', launchConfig: {} as never })).toBe(true)
  })

  it('keeps shells, explicit panes, shell choices and agent-session claims in their own tab', () => {
    expect(shouldJoinOpenWorkspace({ command: 'npm run dev' })).toBe(false)
    expect(shouldJoinOpenWorkspace({ launchAgent: 'claude' })).toBe(false)
    expect(shouldJoinOpenWorkspace({ ...agent, tabId: 'tab' })).toBe(false)
    expect(shouldJoinOpenWorkspace({ ...agent, leafId: 'leaf' })).toBe(false)
    expect(shouldJoinOpenWorkspace({ ...agent, shellOverride: 'pwsh.exe' })).toBe(false)
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: only presence of the claim is read.
    expect(shouldJoinOpenWorkspace({ ...agent, agentSessionClaim: {} as never })).toBe(false)
  })
})

describe('selectSnapshotAgentJoinTarget', () => {
  it('joins the active terminal tab at its largest pane', () => {
    const root: TerminalPaneLayoutNode = {
      type: 'split',
      direction: 'vertical',
      first: leaf('a'),
      second: leaf('b'),
      ratio: 0.3
    }
    expect(
      selectSnapshotAgentJoinTarget({
        activeTabId: 'tab-2',
        tabs: [
          surface('tab-1', 'x', leaf('x')),
          surface('tab-2', 'a', root),
          surface('tab-2', 'b', root)
        ]
      })
    ).toEqual({ tabId: 'tab-2', leafId: 'b', direction: 'vertical' })
  })

  it('falls back to the surface marked active, then the first terminal', () => {
    expect(
      selectSnapshotAgentJoinTarget({
        activeTabId: 'editor-1',
        tabs: [surface('tab-1', 'x', null), surface('tab-2', 'y', null, true)]
      })
    ).toEqual({ tabId: 'tab-2', leafId: 'y', direction: 'vertical' })
    expect(
      selectSnapshotAgentJoinTarget({ activeTabId: null, tabs: [surface('tab-1', 'x', null)] })
    ).toEqual({ tabId: 'tab-1', leafId: 'x', direction: 'vertical' })
  })

  it('opens a tab when the worktree has no terminal surface or no snapshot', () => {
    expect(selectSnapshotAgentJoinTarget({ activeTabId: null, tabs: [] })).toBeNull()
    expect(selectSnapshotAgentJoinTarget(undefined)).toBeNull()
  })
})
