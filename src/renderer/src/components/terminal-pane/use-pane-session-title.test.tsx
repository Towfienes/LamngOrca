// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { usePaneSessionTitle } from './use-pane-session-title'
const resolve = vi.fn()
vi.mock('@/store', () => ({ useAppStore: (selector: (s: object) => unknown) => selector({}) }))
vi.mock('@/lib/worktree-runtime-owner', () => ({ getExecutionHostIdForWorktree: () => 'local' }))
afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})
it('loads the existing history title once and ignores a late answer for the previous session', async () => {
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { aiVault: { resolveSessionTitles: resolve } }
  })
  let settle: (value: {
    titles: { agent: string; sessionId: string; title: string }[]
  }) => void = () => {}
  resolve
    .mockImplementationOnce(
      () =>
        new Promise((r) => {
          settle = r
        })
    )
    .mockResolvedValue({
      titles: [{ agent: 'claude', sessionId: 'new', title: 'New session title' }]
    })
  const { result, rerender } = renderHook(
    ({ id }) => usePaneSessionTitle('claude', { key: 'session_id', id }, 'wt', undefined),
    { initialProps: { id: 'old' } }
  )
  rerender({ id: 'new' })
  await waitFor(() => expect(result.current).toBe('New session title'))
  await act(async () =>
    settle({ titles: [{ agent: 'claude', sessionId: 'old', title: 'Wrong session' }] })
  )
  expect(result.current).toBe('New session title')
  rerender({ id: 'new' })
  expect(resolve).toHaveBeenCalledTimes(2)
})
it('keeps a known title without scanning history', () => {
  const { result } = renderHook(() =>
    usePaneSessionTitle('codex', { key: 'session_id', id: 'saved' }, 'wt', 'Review parser')
  )
  expect(result.current).toBe('Review parser')
  expect(resolve).not.toHaveBeenCalled()
})
