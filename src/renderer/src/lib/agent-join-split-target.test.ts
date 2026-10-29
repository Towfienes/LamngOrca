import { describe, expect, it } from 'vitest'
import type { TerminalPaneLayoutNode } from '../../../shared/terminal-tab-types'
import { findLargestPaneSplit } from '../../../shared/terminal-pane-largest-split'
import { selectAgentJoinSplitTarget } from './agent-join-split-target'

const leaf = (leafId: string): TerminalPaneLayoutNode => ({ type: 'leaf', leafId })
const split = (
  direction: 'vertical' | 'horizontal',
  first: TerminalPaneLayoutNode,
  second: TerminalPaneLayoutNode,
  ratio?: number
): TerminalPaneLayoutNode => ({ type: 'split', direction, first, second, ratio })

describe('findLargestPaneSplit', () => {
  it('splits a lone pane side by side', () => {
    expect(findLargestPaneSplit(leaf('a'))).toEqual({ leafId: 'a', direction: 'vertical' })
  })

  it('picks the widest pane by ratio and splits along its longer side', () => {
    // 'a' keeps 70% of a 16:9 tab; 'b' and 'c' share the rest.
    const root = split('vertical', leaf('a'), split('horizontal', leaf('b'), leaf('c')), 0.7)
    expect(findLargestPaneSplit(root)).toEqual({ leafId: 'a', direction: 'vertical' })
  })

  it('stacks the next pane when the largest one is tall', () => {
    const root = split('vertical', leaf('a'), split('vertical', leaf('b'), leaf('c')), 0.25)
    // a = 4x9, b = c = 6x9: b is largest and taller than wide.
    expect(findLargestPaneSplit(root)).toEqual({ leafId: 'b', direction: 'horizontal' })
  })
})

const terminalTab = (id: string, groupId: string) => ({
  id: `unified-${id}`,
  entityId: id,
  groupId,
  contentType: 'terminal' as const
})

function state(overrides: Record<string, unknown> = {}) {
  return {
    groupsByWorktree: {
      wt: [{ id: 'g1', activeTabId: 'unified-t2', tabOrder: ['unified-t1', 'unified-t2'] }]
    },
    activeGroupIdByWorktree: { wt: 'g1' },
    unifiedTabsByWorktree: { wt: [terminalTab('t1', 'g1'), terminalTab('t2', 'g1')] },
    terminalLayoutsByTabId: {
      t1: { root: leaf('x'), activeLeafId: 'x' },
      t2: { root: split('vertical', leaf('a'), leaf('b'), 0.4), activeLeafId: 'a' }
    },
    ...overrides
  }
}

describe('selectAgentJoinSplitTarget', () => {
  it('joins the active terminal tab of the active group at its largest pane', () => {
    expect(selectAgentJoinSplitTarget(state(), 'wt')).toEqual({
      tabId: 't2',
      leafId: 'b',
      direction: 'vertical'
    })
  })

  it('falls back to the first terminal tab when the active tab is not a terminal', () => {
    const editor = { id: 'unified-e', entityId: 'e', groupId: 'g1', contentType: 'editor' }
    const target = selectAgentJoinSplitTarget(
      state({
        groupsByWorktree: {
          wt: [{ id: 'g1', activeTabId: 'unified-e', tabOrder: ['unified-e', 'unified-t1'] }]
        },
        unifiedTabsByWorktree: { wt: [editor, terminalTab('t1', 'g1')] }
      }),
      'wt'
    )
    expect(target?.tabId).toBe('t1')
  })

  it('returns null without a terminal tab or a known layout, so the caller opens a tab', () => {
    expect(selectAgentJoinSplitTarget(state({ groupsByWorktree: {} }), 'wt')).toBeNull()
    expect(selectAgentJoinSplitTarget(state({ terminalLayoutsByTabId: {} }), 'wt')).toBeNull()
  })
})
