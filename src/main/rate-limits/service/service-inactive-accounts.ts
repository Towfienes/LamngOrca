import { forEachWithConcurrency } from '../../../shared/map-with-concurrency'
import { fetchManagedAccountUsage } from '../claude-fetcher'
import { fetchCodexRateLimits } from '../codex-fetcher'
import { RateLimitServicePolling } from './service-polling'
import {
  INACTIVE_CLAUDE_PROBE_CONCURRENCY,
  INACTIVE_CODEX_PROBE_CONCURRENCY,
  INACTIVE_FETCH_DEBOUNCE_MS
} from './service-types'

export abstract class RateLimitServiceInactiveAccounts extends RateLimitServicePolling {
  async fetchInactiveClaudeAccountsOnOpen(): Promise<void> {
    if (Date.now() - this.lastInactiveClaudeFetchAt < INACTIVE_FETCH_DEBOUNCE_MS) {
      return
    }
    this.pruneInactiveClaudeState()
    if (this.inactiveClaudeFetching.size > 0) {
      return
    }
    const accounts = this.inactiveClaudeAccountsResolver?.() ?? []
    if (accounts.length === 0) {
      return
    }
    const fetchGeneration = this.inactiveClaudeAccountsGeneration
    const controller = this.beginFetchCycle()
    const signal = controller.signal

    for (const account of accounts) {
      this.inactiveClaudeFetching.add(account.id)
    }
    this.pushToRenderer()

    try {
      // Why: accounts are independent, so a few run at once; each result still lands as it finishes.
      await forEachWithConcurrency(accounts, INACTIVE_CLAUDE_PROBE_CONCURRENCY, async (account) => {
        if (
          signal.aborted ||
          fetchGeneration !== this.inactiveClaudeAccountsGeneration ||
          !this.isCurrentInactiveClaudeAccount(account.id)
        ) {
          this.inactiveClaudeFetching.delete(account.id)
          if (!this.isCurrentInactiveClaudeAccount(account.id)) {
            this.inactiveClaudeCache.delete(account.id)
          }
          this.pushToRenderer()
          return
        }
        try {
          const fresh = await fetchManagedAccountUsage(account, {
            allowUsagePanelSupplement: this.shouldAllowClaudeUsagePanelSupplement(),
            networkProxySettings: this.networkProxySettingsResolver?.(),
            signal
          })
          if (
            signal.aborted ||
            fetchGeneration !== this.inactiveClaudeAccountsGeneration ||
            !this.isCurrentInactiveClaudeAccount(account.id)
          ) {
            this.inactiveClaudeFetching.delete(account.id)
            if (!this.isCurrentInactiveClaudeAccount(account.id)) {
              this.inactiveClaudeCache.delete(account.id)
            }
            this.pushToRenderer()
            return
          }
          const cached = this.inactiveClaudeCache.get(account.id) ?? null
          this.inactiveClaudeCache.set(account.id, this.applyStalePolicy(fresh, cached))
        } catch {
          // Why: per-account try/catch keeps one Keychain/network error from aborting the remaining accounts in the batch.
          if (
            signal.aborted ||
            fetchGeneration !== this.inactiveClaudeAccountsGeneration ||
            !this.isCurrentInactiveClaudeAccount(account.id)
          ) {
            this.inactiveClaudeCache.delete(account.id)
          }
        }
        this.inactiveClaudeFetching.delete(account.id)
        this.pushToRenderer()
      })

      if (!signal.aborted && fetchGeneration === this.inactiveClaudeAccountsGeneration) {
        this.lastInactiveClaudeFetchAt = Date.now()
      }
    } finally {
      this.finishFetchCycle(controller)
    }
  }

  async fetchInactiveCodexAccountsOnOpen(): Promise<void> {
    if (Date.now() - this.lastInactiveCodexFetchAt < INACTIVE_FETCH_DEBOUNCE_MS) {
      return
    }
    this.pruneInactiveCodexState()
    if (this.inactiveCodexFetchInFlight) {
      return
    }
    const accounts = this.inactiveCodexAccountsResolver?.() ?? []
    if (accounts.length === 0) {
      return
    }
    // Why: account switching can activate a previewed account while its usage fetch is still in flight; ignore stale results.
    const fetchGeneration = this.inactiveCodexAccountsGeneration
    const controller = this.beginFetchCycle()
    const signal = controller.signal
    this.inactiveCodexFetchInFlight = true

    // Why: show every queued account as loading at once instead of a silent dash until its turn.
    for (const account of accounts) {
      this.inactiveCodexFetching.add(account.id)
    }
    this.pushToRenderer()
    try {
      // Why: each probe spawns a codex process in that account's home, so a small pool bounds
      // the burst while letting the next account start as soon as one finishes.
      await forEachWithConcurrency(accounts, INACTIVE_CODEX_PROBE_CONCURRENCY, async (account) => {
        if (
          signal.aborted ||
          fetchGeneration !== this.inactiveCodexAccountsGeneration ||
          !this.isCurrentInactiveCodexAccount(account.id)
        ) {
          this.inactiveCodexFetching.delete(account.id)
          if (!this.isCurrentInactiveCodexAccount(account.id)) {
            this.inactiveCodexCache.delete(account.id)
          }
          this.pushToRenderer()
          return
        }
        const home = account.resolveHome()
        if (home.kind === 'skip') {
          this.inactiveCodexFetching.delete(account.id)
          this.pushToRenderer()
          return
        }
        try {
          // Why: point fetchCodexRateLimits at the managed home directly, avoiding materializing credentials into the shared runtime location.
          const fresh = await fetchCodexRateLimits({
            codexHomePath: home.managedHomePath,
            signal
          })
          if (
            signal.aborted ||
            fetchGeneration !== this.inactiveCodexAccountsGeneration ||
            !this.isCurrentInactiveCodexAccount(account.id)
          ) {
            this.inactiveCodexFetching.delete(account.id)
            if (!this.isCurrentInactiveCodexAccount(account.id)) {
              this.inactiveCodexCache.delete(account.id)
            }
            this.pushToRenderer()
            return
          }
          const cached = this.inactiveCodexCache.get(account.id) ?? null
          this.inactiveCodexCache.set(account.id, this.applyStalePolicy(fresh, cached))
        } catch {
          // Why: per-account try/catch prevents one failure from aborting the batch.
          if (
            signal.aborted ||
            fetchGeneration !== this.inactiveCodexAccountsGeneration ||
            !this.isCurrentInactiveCodexAccount(account.id)
          ) {
            this.inactiveCodexCache.delete(account.id)
          }
        }
        this.inactiveCodexFetching.delete(account.id)
        this.pushToRenderer()
      })

      if (!signal.aborted && fetchGeneration === this.inactiveCodexAccountsGeneration) {
        this.lastInactiveCodexFetchAt = Date.now()
      }
    } finally {
      this.inactiveCodexFetchInFlight = false
      this.finishFetchCycle(controller)
    }
  }

  evictInactiveClaudeCache(accountId: string): void {
    this.inactiveClaudeAccountsGeneration += 1
    this.inactiveClaudeCache.delete(accountId)
    this.inactiveClaudeFetching.delete(accountId)
    this.lastInactiveClaudeFetchAt = 0
    this.pushToRenderer()
  }

  protected isCurrentInactiveClaudeAccount(accountId: string): boolean {
    return (this.inactiveClaudeAccountsResolver?.() ?? []).some(
      (account) => account.id === accountId
    )
  }

  protected isCurrentInactiveCodexAccount(accountId: string): boolean {
    return (this.inactiveCodexAccountsResolver?.() ?? []).some(
      (account) => account.id === accountId
    )
  }

  protected pruneInactiveClaudeState(): void {
    const currentIds = new Set(
      (this.inactiveClaudeAccountsResolver?.() ?? []).map((account) => account.id)
    )
    for (const accountId of this.inactiveClaudeCache.keys()) {
      if (!currentIds.has(accountId)) {
        this.inactiveClaudeCache.delete(accountId)
      }
    }
    for (const accountId of this.inactiveClaudeFetching) {
      if (!currentIds.has(accountId)) {
        this.inactiveClaudeFetching.delete(accountId)
      }
    }
  }

  protected pruneInactiveCodexState(): void {
    const currentIds = new Set(
      (this.inactiveCodexAccountsResolver?.() ?? []).map((account) => account.id)
    )
    for (const accountId of this.inactiveCodexCache.keys()) {
      if (!currentIds.has(accountId)) {
        this.inactiveCodexCache.delete(accountId)
      }
    }
    for (const accountId of this.inactiveCodexFetching) {
      if (!currentIds.has(accountId)) {
        this.inactiveCodexFetching.delete(accountId)
      }
    }
  }

  evictInactiveCodexCache(accountId: string): void {
    // Why: clear only this account, not the generation — bumping it would discard sibling fetches still in flight and their fresh results.
    this.inactiveCodexCache.delete(accountId)
    this.inactiveCodexFetching.delete(accountId)
    // Why: a re-authenticated account must be probed again now, not after the open-debounce.
    this.lastInactiveCodexFetchAt = 0
    this.pushToRenderer()
  }
}
