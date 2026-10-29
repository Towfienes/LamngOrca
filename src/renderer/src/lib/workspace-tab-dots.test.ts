import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { Tab, TabGroup, TabGroupLayoutNode } from '../../../shared/tab-types'
import {
  NO_WORKSPACE_TAB_DOTS,
  countPaneLeaves,
  createWorkspaceTabDotsSelector,
  selectIsTabDotsStrip,
  selectTabDotsHostGroupId,
  selectWorkspaceTabDots,
  workspaceTabDotsEqual
} from './workspace-tab-dots'

const LEAF_A = '11111111-1111-4111-8111-111111111111'
const LEAF_B = '22222222-2222-4222-8222-222222222222'

const group = (id: string, tabOrder: string[], activeTabId: string | null): TabGroup => ({
  id,
  worktreeId: 'wt',
  activeTabId,
  tabOrder
})
const tab = (
  id: string,
  groupId: string,
  label: string,
  contentType: Tab['contentType'] = 'terminal'
): Tab => ({
  id,
  entityId: `${id}-entity`,
  groupId,
  worktreeId: 'wt',
  contentType,
  label,
  customLabel: label,
  color: null,
  sortOrder: 0,
  createdAt: 1
})
const agent = (paneKey: string, state: AgentStatusEntry['state']): AgentStatusEntry => ({
  paneKey,
  agentType: 'claude',
  state,
  prompt: '',
  updatedAt: 1,
  stateStartedAt: 1,
  stateHistory: []
})

function buildState(overrides = {}) {
  return {
    groupsByWorktree: {
      wt: [group('g1', ['t2', 't1'], 't1'), group('g2', ['t3'], 't3')]
    },
    layoutByWorktree: {
      wt: {
        type: 'split',
        direction: 'horizontal',
        first: { type: 'leaf', groupId: 'g1' },
        second: { type: 'leaf', groupId: 'g2' }
      } satisfies TabGroupLayoutNode
    },
    activeGroupIdByWorktree: { wt: 'g1' },
    unifiedTabsByWorktree: {
      wt: [
        tab('t1', 'g1', 'Review'),
        tab('t2', 'g1', 'Build'),
        tab('t3', 'g2', 'Other'),
        tab('t4', 'g1', 'notes.md', 'editor')
      ]
    },
    terminalLayoutsByTabId: {
      't1-entity': {
        root: {
          type: 'split' as const,
          direction: 'vertical' as const,
          first: { type: 'leaf' as const, leafId: LEAF_A },
          second: { type: 'leaf' as const, leafId: LEAF_B }
        },
        activeLeafId: LEAF_A,
        expandedLeafId: null
      }
    },
    agentStatusByPaneKey: {},
    settings: null,
    ...overrides
  }
}

describe('selectWorkspaceTabDots', () => {
  it('returns nothing without a group', () => {
    const state = buildState({ groupsByWorktree: {} })
    expect(selectWorkspaceTabDots(state, 'wt')).toBe(NO_WORKSPACE_TAB_DOTS)
  })

  it('keeps a single tab as one active dot', () => {
    const state = buildState({
      groupsByWorktree: { wt: [group('g1', ['t1'], 't1')] },
      unifiedTabsByWorktree: { wt: [tab('t1', 'g1', 'Review')] }
    })
    expect(selectWorkspaceTabDots(state, 'wt').map((dot) => [dot.id, dot.active])).toEqual([
      ['t1', true]
    ])
  })

  it('lists the active group tabs in strip order with title, pane count and active tab', () => {
    const dots = selectWorkspaceTabDots(buildState(), 'wt')
    expect(dots.map((dot) => [dot.id, dot.title, dot.paneCount, dot.active])).toEqual([
      ['t2', 'Build', 1, false],
      ['t1', 'Review', 2, true],
      ['t4', 'notes.md', 1, false]
    ])
    expect(dots[2].previewTabId).toBeNull()
  })

  it('follows the active group', () => {
    const state = buildState({ activeGroupIdByWorktree: { wt: 'g2' } })
    expect(selectWorkspaceTabDots(state, 'wt').map((dot) => dot.id)).toEqual(['t3'])
  })

  it('aggregates agent attention per tab with waiting outranking running', () => {
    const state = buildState({
      agentStatusByPaneKey: {
        [`t1-entity:${LEAF_A}`]: agent(`t1-entity:${LEAF_A}`, 'working'),
        [`t1-entity:${LEAF_B}`]: agent(`t1-entity:${LEAF_B}`, 'waiting'),
        [`t2-entity:${LEAF_A}`]: agent(`t2-entity:${LEAF_A}`, 'working')
      }
    })
    const attention = Object.fromEntries(
      selectWorkspaceTabDots(state, 'wt').map((dot) => [dot.id, dot.attention])
    )
    expect(attention).toEqual({ t1: 'waiting', t2: 'running', t4: null })
  })

  it('compares structurally so equal selections can reuse the previous array', () => {
    const first = selectWorkspaceTabDots(buildState(), 'wt')
    const second = selectWorkspaceTabDots(buildState(), 'wt')
    expect(first).not.toBe(second)
    expect(workspaceTabDotsEqual(first, second)).toBe(true)
    const waiting = selectWorkspaceTabDots(
      buildState({
        agentStatusByPaneKey: { [`t2-entity:${LEAF_A}`]: agent(`t2-entity:${LEAF_A}`, 'waiting') }
      }),
      'wt'
    )
    expect(workspaceTabDotsEqual(first, waiting)).toBe(false)
  })

  it('ignores unrelated store churn such as terminal output timestamps', () => {
    const first = selectWorkspaceTabDots(buildState(), 'wt')
    const churned = selectWorkspaceTabDots(
      buildState({ settings: { tabAutoGenerateTitle: false } }),
      'wt'
    )
    expect(workspaceTabDotsEqual(first, churned)).toBe(true)
  })
})

describe('selectTabDotsHostGroupId', () => {
  it('hosts the dots in the first group on screen', () => {
    expect(selectTabDotsHostGroupId(buildState(), 'wt')).toBe('g1')
  })

  it('falls back to the first group without a layout', () => {
    expect(selectTabDotsHostGroupId(buildState({ layoutByWorktree: {} }), 'wt')).toBe('g1')
    expect(
      selectTabDotsHostGroupId(buildState({ groupsByWorktree: {}, layoutByWorktree: {} }), 'wt')
    ).toBeNull()
  })
})

describe('selectIsTabDotsStrip', () => {
  it('turns only the hosting strip into dots, and only while the worktree has tabs', () => {
    expect(selectIsTabDotsStrip(buildState(), 'wt', 'g1')).toBe(true)
    expect(selectIsTabDotsStrip(buildState(), 'wt', 'g2')).toBe(false)
    expect(selectIsTabDotsStrip(buildState(), 'wt', undefined)).toBe(false)
    expect(selectIsTabDotsStrip(buildState({ unifiedTabsByWorktree: {} }), 'wt', 'g1')).toBe(false)
  })
})

it('counts split leaves', () => {
  expect(countPaneLeaves(null)).toBe(0)
  expect(countPaneLeaves(buildState().terminalLayoutsByTabId['t1-entity'].root)).toBe(2)
})

describe('createWorkspaceTabDotsSelector', () => {
  it('returns the cached array for writes that leave every dots input untouched', () => {
    const select = createWorkspaceTabDotsSelector()
    const state = buildState()
    const first = select(state, 'wt')
    expect(select({ ...state, settings: null }, 'wt')).toBe(first)
    // A new status map with the same content recomputes but keeps the array identity.
    expect(select({ ...state, agentStatusByPaneKey: {} }, 'wt')).toBe(first)
  })

  it('recomputes when a dots input changes', () => {
    const select = createWorkspaceTabDotsSelector()
    const state = buildState()
    const first = select(state, 'wt')
    const next = select({ ...state, activeGroupIdByWorktree: { wt: 'g2' } }, 'wt')
    expect(next).not.toBe(first)
    expect(next.map((dot) => dot.id)).toEqual(['t3'])
  })

  it('draws the agent of a tab and its content type', () => {
    const state = buildState({
      agentStatusByPaneKey: { [`t1-entity:${LEAF_A}`]: agent(`t1-entity:${LEAF_A}`, 'working') }
    })
    const dots = createWorkspaceTabDotsSelector()(state, 'wt')
    expect(dots.find((dot) => dot.id === 't1')?.panes).toEqual([
      { leafId: LEAF_A, agent: 'claude', attention: 'running' },
      { leafId: LEAF_B, agent: null, attention: null }
    ])
    expect(dots.find((dot) => dot.id === 't4')?.panes).toEqual([])
    expect(dots.map((dot) => [dot.id, dot.agent, dot.contentType])).toEqual([
      ['t2', null, 'terminal'],
      ['t1', 'claude', 'terminal'],
      ['t4', null, 'editor']
    ])
  })
})
