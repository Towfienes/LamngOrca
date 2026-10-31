import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProviderRateLimits } from '../../shared/rate-limit-types'
import { RateLimitService } from './service'
import { fetchClaudeRateLimits, fetchManagedAccountUsage } from './claude-fetcher'
import { fetchCodexRateLimits } from './codex-fetcher'
import {
  deferred,
  errorProvider,
  okProvider,
  resetRateLimitProviderMocks
} from './rate-limit-service-test-harness'

function inactiveCodexAccount(id: string, managedHomePath: string) {
  return {
    id,
    resolveHome: () => ({ kind: 'ready' as const, managedHomePath })
  }
}

vi.mock('./claude-fetcher', () => ({
  fetchClaudeRateLimits: vi.fn(),
  fetchManagedAccountUsage: vi.fn()
}))

vi.mock('./codex-fetcher', () => ({
  consumeCodexRateLimitResetCredit: vi.fn(),
  fetchCodexRateLimits: vi.fn()
}))

vi.mock('./gemini-usage-fetcher', () => ({
  fetchGeminiRateLimits: vi.fn()
}))

vi.mock('./kimi-fetcher', () => ({
  fetchKimiRateLimits: vi.fn()
}))

vi.mock('./opencode-go-usage-source-selection', () => ({
  fetchOpenCodeGoUsage: vi.fn()
}))

vi.mock('./zcode-usage-fetcher', () => ({
  fetchZcodeRateLimits: vi.fn()
}))

vi.mock('./antigravity-usage-fetcher', () => ({
  fetchAntigravityRateLimits: vi.fn()
}))

vi.mock('./minimax/minimax-fetcher', () => ({
  fetchMiniMaxRateLimits: vi.fn()
}))

vi.mock('./grok-fetcher', () => ({
  fetchGrokRateLimits: vi.fn()
}))

vi.mock('./cursor-fetcher', () => ({
  fetchCursorRateLimits: vi.fn()
}))

vi.mock('./cursor-auth', () => ({
  readCursorAuthSession: vi.fn()
}))

vi.mock('./grok-auth', () => ({
  readGrokAuthSession: vi.fn(() => ({ status: 'missing' }))
}))

vi.mock('../minimax/minimax-cookie-store', () => ({
  hasMiniMaxSessionCookie: vi.fn(() => false)
}))

describe('RateLimitService', () => {
  beforeEach(() => {
    resetRateLimitProviderMocks()
  })

  it('allows 30-second quota refreshes without duplicate or overlapping inactive probes', async () => {
    const now = 1_800_000_000_000
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now)
    const service = new RateLimitService()
    service.setInactiveClaudeAccountsResolver(() => [{ id: 'a' }])
    service.setInactiveCodexAccountsResolver(() => [inactiveCodexAccount('b', '/tmp/quota-b')])
    const pending = deferred<ProviderRateLimits>()
    vi.mocked(fetchManagedAccountUsage).mockReturnValueOnce(pending.promise)
    vi.mocked(fetchCodexRateLimits).mockResolvedValue(okProvider('codex', 20))
    try {
      const first = service.fetchInactiveClaudeAccountsOnOpen(30_000)
      await service.fetchInactiveClaudeAccountsOnOpen(30_000)
      expect(fetchManagedAccountUsage).toHaveBeenCalledTimes(1)
      clock.mockReturnValue(now + 5_000)
      pending.resolve(okProvider('claude', 20))
      await first
      await service.fetchInactiveCodexAccountsOnOpen(30_000)
      clock.mockReturnValue(now + 29_999)
      await service.fetchInactiveClaudeAccountsOnOpen(30_000)
      await service.fetchInactiveCodexAccountsOnOpen(30_000)
      expect(fetchManagedAccountUsage).toHaveBeenCalledTimes(1)
      expect(fetchCodexRateLimits).toHaveBeenCalledTimes(1)
      vi.mocked(fetchManagedAccountUsage).mockResolvedValue(okProvider('claude', 30))
      clock.mockReturnValue(now + 30_000)
      await service.fetchInactiveClaudeAccountsOnOpen(30_000)
      expect(fetchManagedAccountUsage).toHaveBeenCalledTimes(2)
      clock.mockReturnValue(now + 35_000)
      await service.fetchInactiveCodexAccountsOnOpen(30_000)
      expect(fetchCodexRateLimits).toHaveBeenCalledTimes(2)
    } finally {
      service.stop()
      clock.mockRestore()
    }
  })

  it('aborts inactive Claude preview fetches on stop', async () => {
    const service = new RateLimitService()
    const account = { id: 'account-1' }
    const capturedSignals: { claude?: AbortSignal } = {}
    service.setInactiveClaudeAccountsResolver(() => [account])
    vi.mocked(fetchManagedAccountUsage).mockImplementation(
      (_account, options) =>
        new Promise((resolve) => {
          capturedSignals.claude = options?.signal
          options?.signal?.addEventListener(
            'abort',
            () => resolve(errorProvider('claude', 'aborted')),
            { once: true }
          )
        })
    )

    const previewFetch = service.fetchInactiveClaudeAccountsOnOpen()
    await Promise.resolve()

    service.stop()

    expect(capturedSignals.claude?.aborted).toBe(true)

    await previewFetch

    expect(service.getState().inactiveClaudeAccounts).toEqual([])
  })

  it('aborts inactive Codex preview fetches on stop', async () => {
    const service = new RateLimitService()
    const account = inactiveCodexAccount('account-1', '/tmp/account-1/home')
    const capturedSignals: { codex?: AbortSignal } = {}
    service.setInactiveCodexAccountsResolver(() => [account])
    vi.mocked(fetchCodexRateLimits).mockImplementation(
      (options) =>
        new Promise((resolve) => {
          capturedSignals.codex = options?.signal
          options?.signal?.addEventListener(
            'abort',
            () => resolve(errorProvider('codex', 'aborted')),
            { once: true }
          )
        })
    )

    const previewFetch = service.fetchInactiveCodexAccountsOnOpen()
    await Promise.resolve()

    service.stop()

    expect(capturedSignals.codex?.aborted).toBe(true)

    await previewFetch

    expect(service.getState().inactiveCodexAccounts).toEqual([])
  })

  it('passes WSL Codex managed homes into inactive account rate-limit fetches', async () => {
    const service = new RateLimitService()
    const networkProxySettings = { httpProxyUrl: 'http://proxy.fixture.invalid:8080' }
    service.setNetworkProxySettingsResolver(() => networkProxySettings)
    const wslCodexHome =
      '\\\\wsl.localhost\\Ubuntu\\home\\jin\\.local\\share\\orca\\codex-accounts\\a\\home'
    service.setInactiveCodexAccountsResolver(() => [
      inactiveCodexAccount('account-1', wslCodexHome)
    ])
    vi.mocked(fetchCodexRateLimits).mockResolvedValueOnce(okProvider('codex', 33, Date.now()))

    await service.fetchInactiveCodexAccountsOnOpen()

    expect(fetchCodexRateLimits).toHaveBeenCalledWith(
      expect.objectContaining({
        codexHomePath: wslCodexHome,
        networkProxySettings,
        signal: expect.any(AbortSignal)
      })
    )
    expect(service.getState().inactiveCodexAccounts).toEqual([
      {
        accountId: 'account-1',
        rateLimits: expect.objectContaining({
          provider: 'codex',
          session: expect.objectContaining({ usedPercent: 33 })
        }),
        updatedAt: expect.any(Number),
        isFetching: false
      }
    ])
  })

  it('skips an unavailable inactive home without dropping its cache and recovers later', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-17T12:00:00Z'))
    try {
      const service = new RateLimitService()
      let unavailable = false
      service.setInactiveCodexAccountsResolver(() => [
        {
          id: 'account-1',
          resolveHome: () =>
            unavailable
              ? { kind: 'skip' as const }
              : { kind: 'ready' as const, managedHomePath: '/tmp/account-1/home' }
        }
      ])
      vi.mocked(fetchCodexRateLimits)
        .mockResolvedValueOnce(okProvider('codex', 33, Date.now()))
        .mockResolvedValueOnce(okProvider('codex', 67, Date.now()))

      await service.fetchInactiveCodexAccountsOnOpen()
      unavailable = true
      await vi.advanceTimersByTimeAsync(10 * 60_000)
      await service.fetchInactiveCodexAccountsOnOpen()

      expect(fetchCodexRateLimits).toHaveBeenCalledOnce()
      expect(service.getState().inactiveCodexAccounts).toEqual([
        expect.objectContaining({
          accountId: 'account-1',
          isFetching: false,
          rateLimits: expect.objectContaining({
            session: expect.objectContaining({ usedPercent: 33 })
          })
        })
      ])

      unavailable = false
      await vi.advanceTimersByTimeAsync(10 * 60_000)
      await service.fetchInactiveCodexAccountsOnOpen()

      expect(fetchCodexRateLimits).toHaveBeenCalledTimes(2)
      expect(service.getState().inactiveCodexAccounts[0]?.rateLimits?.session?.usedPercent).toBe(67)
    } finally {
      vi.useRealTimers()
    }
  })

  it('allows usage-panel Fable supplements for inactive Claude account previews', async () => {
    const service = new RateLimitService()
    const account = { id: 'account-1' }
    service.setInactiveClaudeAccountsResolver(() => [account])
    vi.mocked(fetchManagedAccountUsage).mockResolvedValueOnce(okProvider('claude', 33, Date.now()))

    await service.fetchInactiveClaudeAccountsOnOpen()

    expect(fetchManagedAccountUsage).toHaveBeenCalledWith(
      account,
      expect.objectContaining({
        allowUsagePanelSupplement: true,
        signal: expect.any(AbortSignal)
      })
    )
  })

  it('does not start overlapping inactive Claude preview fetches', async () => {
    const service = new RateLimitService()
    const accountFetch = deferred<ProviderRateLimits>()
    service.setInactiveClaudeAccountsResolver(() => [{ id: 'account-1' }])
    vi.mocked(fetchManagedAccountUsage).mockReturnValueOnce(accountFetch.promise)

    const firstFetch = service.fetchInactiveClaudeAccountsOnOpen()
    await Promise.resolve()
    await service.fetchInactiveClaudeAccountsOnOpen()

    expect(fetchManagedAccountUsage).toHaveBeenCalledTimes(1)

    accountFetch.resolve(okProvider('claude', 50, Date.now()))
    await firstFetch
  })

  it('does not start overlapping inactive Codex preview fetches', async () => {
    const service = new RateLimitService()
    const accountFetch = deferred<ProviderRateLimits>()
    service.setInactiveCodexAccountsResolver(() => [
      inactiveCodexAccount('account-1', '/tmp/account-1/home')
    ])
    vi.mocked(fetchCodexRateLimits).mockReturnValueOnce(accountFetch.promise)

    const firstFetch = service.fetchInactiveCodexAccountsOnOpen()
    await Promise.resolve()
    await service.fetchInactiveCodexAccountsOnOpen()

    expect(fetchCodexRateLimits).toHaveBeenCalledTimes(1)

    accountFetch.resolve(okProvider('codex', 50, Date.now()))
    await firstFetch
  })

  it('keeps sibling inactive Codex preview fetches alive when one account is evicted', async () => {
    const service = new RateLimitService()
    const accountFetch = deferred<ProviderRateLimits>()
    let inactiveAccounts = [
      inactiveCodexAccount('account-a', '/tmp/account-a/home'),
      inactiveCodexAccount('account-b', '/tmp/account-b/home')
    ]
    service.setInactiveCodexAccountsResolver(() => inactiveAccounts)
    const evictedFetch = deferred<ProviderRateLimits>()
    vi.mocked(fetchCodexRateLimits)
      .mockReturnValueOnce(accountFetch.promise)
      .mockReturnValueOnce(evictedFetch.promise)

    const fetchOnOpen = service.fetchInactiveCodexAccountsOnOpen()
    await Promise.resolve()
    expect(service.getState().inactiveCodexAccounts).toEqual([
      { accountId: 'account-a', rateLimits: null, updatedAt: 0, isFetching: true },
      { accountId: 'account-b', rateLimits: null, updatedAt: 0, isFetching: true }
    ])

    inactiveAccounts = [inactiveCodexAccount('account-a', '/tmp/account-a/home')]
    service.evictInactiveCodexCache('account-b')
    accountFetch.resolve(okProvider('codex', 64, Date.now()))
    evictedFetch.resolve(okProvider('codex', 10, Date.now()))
    await fetchOnOpen

    expect(fetchCodexRateLimits).toHaveBeenCalledTimes(2)
    expect(service.getState().inactiveCodexAccounts).toEqual([
      {
        accountId: 'account-a',
        rateLimits: expect.objectContaining({
          provider: 'codex',
          session: expect.objectContaining({ usedPercent: 64 })
        }),
        updatedAt: expect.any(Number),
        isFetching: false
      }
    ])
  })

  it('does not recache an inactive Codex account that becomes active during fetch-on-open', async () => {
    const service = new RateLimitService()
    const accountFetch = deferred<ProviderRateLimits>()
    let inactiveAccounts = [inactiveCodexAccount('account-b', '/tmp/account-b/home')]
    service.setInactiveCodexAccountsResolver(() => inactiveAccounts)
    service.setCodexHomePathResolver(() => ({
      kind: 'ready',
      codexHomePath: '/tmp/account-b/home'
    }))
    vi.mocked(fetchCodexRateLimits)
      .mockReturnValueOnce(accountFetch.promise)
      .mockResolvedValueOnce(okProvider('codex', 7, Date.now()))

    const fetchOnOpen = service.fetchInactiveCodexAccountsOnOpen()
    await Promise.resolve()
    expect(service.getState().inactiveCodexAccounts).toEqual([
      { accountId: 'account-b', rateLimits: null, updatedAt: 0, isFetching: true }
    ])

    inactiveAccounts = []
    await service.refreshForCodexAccountChange('account-a')
    accountFetch.resolve(okProvider('codex', 42, Date.now()))
    await fetchOnOpen

    expect(service.getState().inactiveCodexAccounts).toEqual([])
  })

  it('keeps the inactive Codex debounce across an account switch instead of re-probing', async () => {
    const service = new RateLimitService()
    service.setInactiveCodexAccountsResolver(() => [
      inactiveCodexAccount('account-b', '/tmp/account-b/home')
    ])
    vi.mocked(fetchCodexRateLimits).mockImplementation(async () => okProvider('codex', 10))

    await service.fetchInactiveCodexAccountsOnOpen()
    expect(fetchCodexRateLimits).toHaveBeenCalledTimes(1)

    await service.refreshForCodexAccountChange('account-a')
    expect(fetchCodexRateLimits).toHaveBeenCalledTimes(2)

    // Reopening inside debounce must not spawn Codex again in each live credential home.
    await service.fetchInactiveCodexAccountsOnOpen()
    expect(fetchCodexRateLimits).toHaveBeenCalledTimes(2)
  })

  it('probes inactive Codex accounts through a bounded pool, starting the next as one finishes', async () => {
    const service = new RateLimitService()
    const ids = ['a', 'b', 'c', 'd', 'e']
    service.setInactiveCodexAccountsResolver(() =>
      ids.map((id) => inactiveCodexAccount(`account-${id}`, `/tmp/account-${id}/home`))
    )
    const pending: (() => void)[] = []
    let running = 0
    let peak = 0
    vi.mocked(fetchCodexRateLimits).mockImplementation(async () => {
      running += 1
      peak = Math.max(peak, running)
      await new Promise<void>((resolve) => pending.push(resolve))
      running -= 1
      return okProvider('codex', 5)
    })

    const fetchOnOpen = service.fetchInactiveCodexAccountsOnOpen()
    await vi.waitFor(() => expect(fetchCodexRateLimits).toHaveBeenCalledTimes(3))
    // Every queued account reads as loading right away, not as a blank row.
    expect(service.getState().inactiveCodexAccounts.every((row) => row.isFetching)).toBe(true)
    pending.shift()!()
    await vi.waitFor(() => expect(fetchCodexRateLimits).toHaveBeenCalledTimes(4))
    while (pending.length > 0 || running > 0) {
      pending.shift()?.()
      await Promise.resolve()
    }
    await fetchOnOpen
    expect(fetchCodexRateLimits).toHaveBeenCalledTimes(5)
    expect(peak).toBe(3)
  })

  it('does not start another inactive Codex batch while one is in flight', async () => {
    const service = new RateLimitService()
    service.setInactiveCodexAccountsResolver(() => [
      inactiveCodexAccount('account-a', '/tmp/account-a/home'),
      inactiveCodexAccount('account-b', '/tmp/account-b/home')
    ])
    const releases: (() => void)[] = []
    vi.mocked(fetchCodexRateLimits).mockImplementation(
      () =>
        new Promise((resolve) => {
          releases.push(() => resolve(okProvider('codex', 5)))
        })
    )
    const fetchOnOpen = service.fetchInactiveCodexAccountsOnOpen()
    await vi.waitFor(() => expect(fetchCodexRateLimits).toHaveBeenCalledTimes(2))
    await service.fetchInactiveCodexAccountsOnOpen()
    expect(fetchCodexRateLimits).toHaveBeenCalledTimes(2)
    for (const release of releases) {
      release()
    }
    await fetchOnOpen
  })

  it('re-probes a Codex account right after re-authentication instead of waiting out the debounce', async () => {
    const service = new RateLimitService()
    service.setInactiveCodexAccountsResolver(() => [
      inactiveCodexAccount('account-a', '/tmp/account-a/home')
    ])
    vi.mocked(fetchCodexRateLimits).mockResolvedValue(okProvider('codex', 5))
    await service.fetchInactiveCodexAccountsOnOpen()
    expect(fetchCodexRateLimits).toHaveBeenCalledTimes(1)
    service.evictInactiveCodexCache('account-a')
    await service.fetchInactiveCodexAccountsOnOpen()
    expect(fetchCodexRateLimits).toHaveBeenCalledTimes(2)
  })

  it('does not recache an inactive Claude account removed during fetch-on-open', async () => {
    const service = new RateLimitService()
    const accountFetch = deferred<ProviderRateLimits>()
    let inactiveAccounts = [{ id: 'account-1' }]
    service.setInactiveClaudeAccountsResolver(() => inactiveAccounts)
    service.setClaudeAuthPreparationResolver(async () => ({
      configDir: '/tmp/.claude',
      envPatch: {},
      provenance: 'system'
    }))
    vi.mocked(fetchClaudeRateLimits).mockResolvedValue(okProvider('claude', 7))
    await service.refresh()
    vi.mocked(fetchManagedAccountUsage).mockReturnValueOnce(accountFetch.promise)

    const fetchOnOpen = service.fetchInactiveClaudeAccountsOnOpen()
    await Promise.resolve()
    expect(service.getState().inactiveClaudeAccounts).toEqual([
      { accountId: 'account-1', rateLimits: null, updatedAt: 0, isFetching: true }
    ])

    service.evictInactiveClaudeCache('account-1')
    inactiveAccounts = [{ id: 'account-1' }]
    await service.refreshForClaudeAccountChange('account-1')
    expect(service.getState().inactiveClaudeAccounts[0]?.accountId).toBe('account-1')

    inactiveAccounts = []
    service.evictInactiveClaudeCache('account-1')
    accountFetch.resolve(okProvider('claude', 42))
    await fetchOnOpen

    expect(service.getState().inactiveClaudeAccounts).toEqual([])
  })

  it('does not overwrite inactive Claude cache from a stale same-id fetch', async () => {
    const service = new RateLimitService()
    const accountFetch = deferred<ProviderRateLimits>()
    service.setInactiveClaudeAccountsResolver(() => [{ id: 'account-1' }])
    service.setClaudeAuthPreparationResolver(async () => ({
      configDir: '/tmp/.claude',
      envPatch: {},
      provenance: 'system'
    }))
    vi.mocked(fetchClaudeRateLimits).mockResolvedValue(okProvider('claude', 7))
    await service.refresh()
    vi.mocked(fetchManagedAccountUsage).mockReturnValueOnce(accountFetch.promise)

    const fetchOnOpen = service.fetchInactiveClaudeAccountsOnOpen()
    await Promise.resolve()

    await service.refreshForClaudeAccountChange('account-1')
    accountFetch.resolve(okProvider('claude', 42))
    await fetchOnOpen

    expect(service.getState().inactiveClaudeAccounts).toEqual([
      {
        accountId: 'account-1',
        rateLimits: expect.objectContaining({
          provider: 'claude',
          session: expect.objectContaining({ usedPercent: 7 })
        }),
        updatedAt: expect.any(Number),
        isFetching: false
      }
    ])
  })
})
