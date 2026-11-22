import { useAppStore } from '@/store'

const ENABLED_ONCE_KEY = 'orca.deckUsage.trackingEnabledOnce'
let inflight: Promise<boolean> | null = null

async function enableOnce(): Promise<boolean> {
  const storage = window.localStorage
  if (storage.getItem(ENABLED_ONCE_KEY)) {
    return false
  }
  const [claude, codex] = await Promise.all([
    window.api.claudeUsage.getScanState(),
    window.api.codexUsage.getScanState()
  ])
  // Desktop-only usage APIs resolve undefined in paired web clients.
  if (!claude || !codex) {
    return false
  }
  if (claude.enabled || codex.enabled) {
    storage.setItem(ENABLED_ONCE_KEY, '1')
    return false
  }
  const state = useAppStore.getState()
  await Promise.all([state.setClaudeUsageEnabled(true), state.setCodexUsageEnabled(true)])
  const next = useAppStore.getState()
  if (!next.claudeUsageScanState?.enabled || !next.codexUsageScanState?.enabled) {
    return false
  }
  storage.setItem(ENABLED_ONCE_KEY, '1')
  return true
}

/**
 * Why: the Deck always shows the cost panel, but tracking defaults to off on a new install.
 * This runs once per profile, so turning tracking off in Settings later stays off.
 */
export function enableDeckUsageTrackingOnce(): Promise<boolean> {
  inflight ??= enableOnce()
    .catch(() => false)
    .finally(() => {
      inflight = null
    })
  return inflight
}
