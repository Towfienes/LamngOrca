import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import {
  callAntigravityAccounts,
  callAntigravityInactiveUsage
} from '@/runtime/runtime-antigravity-accounts-client'
import type { AntigravityAccountState } from '../../../../shared/antigravity-account-types'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'

const HOST = { runtime: 'host' as const }
const LOCAL = { kind: 'local' as const }

/** Saved agy accounts for the deck picker; the signed-in account is saved automatically. */
export function useDeckAntigravityAccounts(enabled: boolean) {
  const [state, setState] = useState<AntigravityAccountState | null>(null)
  const [usage, setUsage] = useState<Record<string, ProviderRateLimits>>({})
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mounted = useRef(true)

  const loadUsage = useCallback(async () => {
    setFetching(true)
    try {
      const next = await callAntigravityInactiveUsage(HOST)
      if (mounted.current) {
        setUsage(next)
      }
    } catch {
      // Inactive previews are optional; the row keeps showing its last figure.
    } finally {
      if (mounted.current) {
        setFetching(false)
      }
    }
  }, [])

  useEffect(() => {
    mounted.current = true
    if (!enabled) {
      return
    }
    void (async () => {
      try {
        let next = await callAntigravityAccounts(LOCAL, HOST, 'List')
        if (next.currentAccount && !next.activeAccountId) {
          next = await callAntigravityAccounts(LOCAL, HOST, 'AddCurrent').catch(() => next)
        }
        if (mounted.current) {
          setState(next)
        }
        if (next.accounts.length > 1) {
          void loadUsage()
        }
      } catch (cause) {
        if (mounted.current) {
          const message = cause instanceof Error ? cause.message : ''
          setError(
            /Protected secret storage|vault was preserved/.test(message)
              ? 'Saved agy accounts are locked for this Orca run (the OS keyring was still locked when Orca started). You can still open the current agy account; restart Orca to switch accounts.'
              : message || 'agy accounts could not be loaded.'
          )
        }
      }
    })()
    return () => {
      mounted.current = false
    }
  }, [enabled, loadUsage])

  /** Makes `id` the native agy account; resolves false if switching failed. */
  const select = useCallback(async (id: string): Promise<boolean> => {
    setError(null)
    try {
      const next = await callAntigravityAccounts(LOCAL, HOST, 'Select', id)
      if (mounted.current) {
        setState(next)
      }
      void useAppStore.getState().refreshRateLimits()
      return true
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : 'Could not switch the agy account.')
      }
      return false
    }
  }, [])

  /** Saves the signed-in account and signs agy out, so the next agy start signs in a new one. */
  const prepareNewAccount = useCallback(async (): Promise<boolean> => {
    setError(null)
    try {
      let next = await callAntigravityAccounts(LOCAL, HOST, 'List')
      if (next.currentAccount && !next.activeAccountId) {
        next = await callAntigravityAccounts(LOCAL, HOST, 'AddCurrent')
      }
      next = await callAntigravityAccounts(LOCAL, HOST, 'SignOutForNewAccount')
      if (mounted.current) {
        setState(next)
      }
      return true
    } catch (cause) {
      if (mounted.current) {
        setError(cause instanceof Error ? cause.message : 'Could not prepare a new agy sign-in.')
      }
      return false
    }
  }, [])

  return { state, usage, fetching, error, select, prepareNewAccount, refreshUsage: loadUsage }
}
