// @vitest-environment happy-dom
import { cleanup, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { usePaneSessionTitle } from './use-pane-session-title'

const LEAF_A = '11111111-1111-4111-8111-111111111111'
const LEAF_B = '22222222-2222-4222-8222-222222222222'
let state: Record<string, unknown> = {}
vi.mock('@/store', () => ({
  useAppStore: (selector: (s: Record<string, unknown>) => unknown) => selector(state)
}))

function splitState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    tabsByWorktree: {
      wt: [
        {
          id: 'tab',
          title: '✳ Kho skill MCP và plugin',
          customTitle: 'Workspace',
          aiVaultTitle: { agent: 'claude', sessionId: 'a', title: 'Kho skill MCP và plugin' }
        }
      ]
    },
    terminalLayoutsByTabId: {
      tab: {
        root: {
          type: 'split',
          direction: 'vertical',
          first: { type: 'leaf', leafId: LEAF_A },
          second: { type: 'leaf', leafId: LEAF_B }
        },
        activeLeafId: LEAF_A,
        expandedLeafId: null
      }
    },
    runtimePaneTitlesByTabId: {},
    aiVaultSessionTitlesByKey: { 'claude\0b': 'Tối ưu claude9 giống Claude thuần' },
    ...overrides
  }
}

afterEach(() => {
  cleanup()
  state = {}
})

it("shows each split pane its own session's title, never the focused sibling's", () => {
  state = splitState()
  const { result: a } = renderHook(() =>
    usePaneSessionTitle(`tab:${LEAF_A}`, 'claude', 'a', 'wt', undefined)
  )
  const { result: b } = renderHook(() =>
    usePaneSessionTitle(`tab:${LEAF_B}`, 'claude', 'b', 'wt', undefined)
  )
  expect(a.current).toBe('Kho skill MCP và plugin')
  expect(b.current).toBe('Tối ưu claude9 giống Claude thuần')
})

it('follows the session id, so a resumed session never keeps the previous title', () => {
  state = splitState({
    aiVaultSessionTitlesByKey: { 'claude\0old': 'Old work', 'claude\0new': 'New work' }
  })
  const { result, rerender } = renderHook(
    ({ id }) => usePaneSessionTitle(`tab:${LEAF_B}`, 'claude', id, 'wt', undefined),
    { initialProps: { id: 'old' } }
  )
  expect(result.current).toBe('Old work')
  rerender({ id: 'new' })
  expect(result.current).toBe('New work')
})

it("keeps the user's pane rename over every automatic title", () => {
  state = splitState()
  const { result } = renderHook(() =>
    usePaneSessionTitle(`tab:${LEAF_B}`, 'claude', 'b', 'wt', 'Review parser')
  )
  expect(result.current).toBe('Review parser')
})

it('shows no title rather than a prompt when the session has no trustworthy name', () => {
  state = splitState({
    aiVaultSessionTitlesByKey: { 'claude\0b': '--- name: paper-referee description: x' }
  })
  const { result } = renderHook(() =>
    usePaneSessionTitle(`tab:${LEAF_B}`, 'claude', 'b', 'wt', undefined)
  )
  expect(result.current).toBeUndefined()
})

it('shows a plain terminal pane only its manual title', () => {
  state = splitState()
  const { result } = renderHook(() =>
    usePaneSessionTitle(`tab:${LEAF_B}`, undefined, undefined, 'wt', 'Logs')
  )
  expect(result.current).toBe('Logs')
})
