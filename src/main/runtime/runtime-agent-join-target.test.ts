import { describe, expect, it } from 'vitest'
import type { RuntimeMobileSessionTerminalTab } from '../../shared/runtime-mobile-session-tab-contracts'
import type { TerminalPaneLayoutNode } from '../../shared/terminal-tab-types'
import {
  selectSnapshotAgentJoinTarget,
  shouldJoinOpenWorkspace,
  withRevealedAgentJoin
} from './runtime-agent-join-target'
import { allocateTerminalPaneIdentity } from './runtime-terminal-pane-identity'

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

describe('withRevealedAgentJoin', () => {
  const launch = { command: 'claude', launchAgent: 'claude' as const }
  const snapshot = { activeTabId: 'tab-1', tabs: [surface('tab-1', 'a', leaf('a'), true)] }

  it('carries the join target so the pane key is minted under the open tab', () => {
    const joined = withRevealedAgentJoin({}, launch, snapshot)
    expect(joined.agentJoin).toEqual({ tabId: 'tab-1', leafId: 'a', direction: 'vertical' })
    const identity = allocateTerminalPaneIdentity(joined)
    expect(identity.tabId).toBe('tab-1')
    expect(identity.paneKey).toBe(`tab-1:${identity.leafId}`)
    expect(identity.leafId).not.toBe('a')
  })

  it('leaves background launches and plain shells in their own tab', () => {
    expect(withRevealedAgentJoin({ presentation: 'background' }, launch, snapshot)).toBe(launch)
    const shell = { command: 'npm run dev' }
    expect(withRevealedAgentJoin({}, shell, snapshot)).toBe(shell)
  })
})
