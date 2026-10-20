/** @vitest-environment happy-dom */
import { cleanup, renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useDeckUsageOverview } from './use-deck-usage-overview'
import type { CodexUsageRange } from '../../../../shared/codex-usage-types'

const empty = { scanState: null, summary: null, daily: [] }
const codex = vi.fn()

function snapshot(cost: number) {
  return {
    scanState: { enabled: true, isScanning: false },
    summary: {
      estimatedCostUsd: cost,
      inputTokens: 1_000,
      outputTokens: 100,
      cachedInputTokens: 100,
      totalTokens: 1_100,
      hasAnyCodexData: true
    },
    daily: []
  }
}

beforeEach(() => {
  codex.mockReset().mockResolvedValue(snapshot(20))
  vi.stubGlobal('window', {
    document,
    api: {
      claudeUsage: { getSnapshot: vi.fn().mockResolvedValue(empty) },
      codexUsage: { getSnapshot: codex },
      openCodeUsage: { getSnapshot: vi.fn().mockResolvedValue(empty) },
      museUsage: { getSnapshot: vi.fn().mockResolvedValue(empty) }
    }
  })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

it('uses an independent all-local period without changing shared usage preferences', async () => {
  const { result, rerender } = renderHook(({ range }) => useDeckUsageOverview(range, 0), {
    initialProps: { range: 'all' as const }
  })
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(codex).toHaveBeenCalledWith({ scope: 'all', range: 'all' })
  expect(result.current.overview.estimatedCostUsd).toBe(20)
  rerender({ range: 'all' })
  expect(codex).toHaveBeenCalledTimes(1)
})

it('keeps available providers when one fails and reports the missing data', async () => {
  window.api.claudeUsage.getSnapshot = vi.fn().mockRejectedValue(new Error('Unavailable'))
  const { result } = renderHook(() => useDeckUsageOverview('7d', 0))
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.overview.estimatedCostUsd).toBe(20)
  expect(result.current.error).toContain('unavailable')
})

it('ignores a late response after the period changes', async () => {
  let finishOld: ((value: ReturnType<typeof snapshot>) => void) | undefined
  codex.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOld = resolve
      })
  )
  const { result, rerender } = renderHook(
    ({ range }: { range: CodexUsageRange }) => useDeckUsageOverview(range, 0),
    { initialProps: { range: 'all' } }
  )
  rerender({ range: '7d' })
  await waitFor(() => expect(result.current.loading).toBe(false))
  await act(async () => {
    finishOld?.(snapshot(99))
  })
  expect(result.current.overview.estimatedCostUsd).toBe(20)
})

it('keeps its settled totals while refreshing and after a transient failure', async () => {
  const { result, rerender } = renderHook(({ revision }) => useDeckUsageOverview('all', revision), {
    initialProps: { revision: 0 }
  })
  await waitFor(() => expect(result.current.loading).toBe(false))
  let fail: ((error: Error) => void) | undefined
  codex.mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject
      })
  )
  rerender({ revision: 1 })
  expect(result.current.loading).toBe(true)
  expect(result.current.overview.estimatedCostUsd).toBe(20)
  await act(async () => {
    fail?.(new Error('Temporary failure'))
  })
  await waitFor(() => expect(result.current.loading).toBe(false))
  expect(result.current.overview.estimatedCostUsd).toBe(20)
  expect(result.current.error).toContain('unavailable')
})
