// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'
import { DeckQuotaBlock } from './DeckQuotaBlock'

function usage(sessionUsed: number): ProviderRateLimits {
  return {
    provider: 'claude',
    session: {
      usedPercent: sessionUsed,
      windowMinutes: 300,
      resetsAt: null,
      resetDescription: null
    },
    weekly: { usedPercent: 10, windowMinutes: 10080, resetsAt: null, resetDescription: null },
    updatedAt: 1,
    error: null,
    status: 'ok'
  }
}

function rowOf(element: HTMLElement): HTMLElement {
  const row = element.closest('[data-quota-provider]')
  if (!(row instanceof HTMLElement)) {
    throw new Error('quota row missing')
  }
  return row
}

function seed(previews: { accountId: string; used: number | null; isFetching?: boolean }[]): void {
  const state = useAppStore.getState()
  useAppStore.setState({
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the block reads only the account lists and active ids.
    settings: {
      ...state.settings,
      claudeManagedAccounts: [
        { id: 'a', email: 'first@example.com' },
        { id: 'b', email: 'second@example.com' },
        { id: 'c', email: 'third@example.com' }
      ],
      activeClaudeManagedAccountId: 'a',
      codexManagedAccounts: []
    } as never,
    rateLimits: {
      ...state.rateLimits,
      claude: usage(20),
      codex: null,
      inactiveClaudeAccounts: previews.map((preview) => ({
        accountId: preview.accountId,
        rateLimits: preview.used === null ? null : usage(preview.used),
        updatedAt: 1,
        isFetching: preview.isFetching ?? false
      }))
    },
    fetchInactiveClaudeAccountUsage: vi.fn(async () => {}),
    fetchInactiveCodexAccountUsage: vi.fn(async () => {})
  })
}

beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

it('lists every Claude account with the active one first and requests inactive previews', () => {
  seed([{ accountId: 'b', used: 90 }])
  render(<DeckQuotaBlock />)
  const rows = screen.getAllByText(/first|second|third/)
  expect(rows.map((row) => row.textContent)).toEqual(['first', 'second', 'third'])
  const active = rowOf(rows[0])
  expect(active.dataset.quotaActive).toBe('true')
  const second = rowOf(rows[1])
  expect(within(second).getByText('10%')).toBeTruthy()
  expect(useAppStore.getState().fetchInactiveClaudeAccountUsage).toHaveBeenCalledTimes(1)
})

it('shows updating while an inactive preview is pending and a neutral note when it has none', () => {
  seed([
    { accountId: 'b', used: null, isFetching: true },
    { accountId: 'c', used: null }
  ])
  render(<DeckQuotaBlock />)
  expect(screen.getByText('Updating…')).toBeTruthy()
  expect(screen.getByText('No usage data yet')).toBeTruthy()
})

it('refreshes quota every 30 seconds, pauses while hidden or collapsed and cleans up', async () => {
  vi.useFakeTimers()
  seed([])
  let visibility: DocumentVisibilityState = 'visible'
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility)
  const get = vi.fn(async () => useAppStore.getState().rateLimits)
  const previousApi = window.api
  Object.defineProperty(window, 'api', { configurable: true, value: { rateLimits: { get } } })
  try {
    const { unmount } = render(<DeckQuotaBlock />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(get).toHaveBeenCalledWith({ refreshQuota: true })
    const count = get.mock.calls.length
    visibility = 'hidden'
    fireEvent(document, new Event('visibilitychange'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(get).toHaveBeenCalledTimes(count)
    visibility = 'visible'
    await act(async () => {
      fireEvent(document, new Event('visibilitychange'))
    })
    expect(get).toHaveBeenCalledTimes(count + 1)
    fireEvent.click(screen.getByText('Quota'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(get).toHaveBeenCalledTimes(count + 1)
    fireEvent.click(screen.getByText('Quota'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(get.mock.calls.length).toBeGreaterThan(count + 1)
    const beforeUnmount = get.mock.calls.length
    unmount()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(get).toHaveBeenCalledTimes(beforeUnmount)
  } finally {
    Object.defineProperty(window, 'api', { configurable: true, value: previousApi })
  }
})
