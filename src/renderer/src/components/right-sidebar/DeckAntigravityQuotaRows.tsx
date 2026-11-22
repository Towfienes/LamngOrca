import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { AgentIcon } from '@/lib/agent-catalog'
import { useResetCountdownClock } from '@/hooks/useResetCountdownClock'
import { formatResetCountdown } from '../status-bar/tooltip'
import { useDeckAntigravityAccounts } from '../sidebar/use-deck-antigravity-accounts'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'
import { buildAgyQuotaLines, describeAgyBuckets } from './deck-antigravity-quota-model'

// Why: each inactive agy account costs one ~3 s `agy -p /usage` run, so they refresh slower
// than the active account, which rides the 30 s quota poll of DeckQuotaBlock.
const INACTIVE_POLL_MS = 5 * 60_000

type AgyRow = { key: string; label: string; usage: ProviderRateLimits | null; active: boolean }

/** Antigravity quota rows (active account first) for the Deck usage panel. */
export function DeckAntigravityQuotaRows({ open }: { open: boolean }): React.JSX.Element | null {
  const active = useAppStore((s) => s.rateLimits?.antigravity ?? null)
  const enabled = Boolean(active && active.status !== 'unavailable')
  const agy = useDeckAntigravityAccounts(enabled)
  const { refreshUsage } = agy
  const accountCount = agy.state?.accounts.length ?? 0

  useEffect(() => {
    if (!open || accountCount < 2) {
      return
    }
    const tick = (): void => {
      if (document.visibilityState !== 'hidden') {
        void refreshUsage()
      }
    }
    const timer = window.setInterval(tick, INACTIVE_POLL_MS)
    return () => window.clearInterval(timer)
  }, [open, accountCount, refreshUsage])

  if (!enabled) {
    return null
  }
  const state = agy.state
  const activeId = state?.activeAccountId ?? null
  const activeLabel =
    state?.accounts.find((a) => a.id === activeId)?.email ?? state?.currentAccount?.email ?? 'agy'
  const rows: AgyRow[] = [
    { key: activeId ?? 'agy-current', label: activeLabel, usage: active, active: true }
  ]
  for (const account of state?.accounts ?? []) {
    if (account.id !== activeId) {
      rows.push({
        key: account.id,
        label: account.email ?? account.id,
        usage: agy.usage[account.id] ?? null,
        active: false
      })
    }
  }
  return (
    <>
      {rows.map((row) => (
        <AgyQuotaRow key={row.key} row={row} fetching={!row.active && agy.fetching} />
      ))}
    </>
  )
}

function AgyQuotaRow({ row, fetching }: { row: AgyRow; fetching: boolean }): React.JSX.Element {
  const lines = buildAgyQuotaLines(row.usage)
  const now = useResetCountdownClock(lines.map((line) => line.resetsAt))
  const busy = fetching || row.usage?.status === 'fetching'
  return (
    <div
      data-quota-provider="antigravity"
      data-quota-active={row.active ? 'true' : undefined}
      className="space-y-0.5 py-1.5"
      title={describeAgyBuckets(row.usage) || undefined}
    >
      <div className="flex items-center gap-1.5 text-[12px]">
        <AgentIcon agent="antigravity" size={13} />
        <span className={cn('min-w-0 flex-1 truncate', !row.active && 'text-muted-foreground')}>
          {row.label.split('@')[0]}
        </span>
        {row.active ? <span className="deck-quota-active-dot" aria-label="Active account" /> : null}
        {busy ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" aria-label="Updating" />
        ) : null}
      </div>
      {lines.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {busy ? 'Updating…' : (row.usage?.error ?? 'No usage data yet')}
        </p>
      ) : (
        lines.map((line) => (
          <div key={line.span} className="deck-quota-split text-[11px] text-muted-foreground">
            <span>{line.span}</span>
            {line.cells.map((cell) => (
              <span key={cell.pool} className="deck-quota-cell">
                <span className="deck-quota-pool">{cell.pool}</span>
                <span
                  className="deck-cost-track"
                  role="meter"
                  aria-label={`${cell.pool === 'G' ? 'Gemini' : 'Claude and GPT'} ${line.span} quota left`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={cell.left}
                >
                  <span
                    className={cn(
                      'deck-quota-fill block',
                      cell.left < 5
                        ? 'deck-quota-fill-critical'
                        : cell.left < 20 && 'deck-quota-fill-low'
                    )}
                    style={{ width: `${cell.left}%` }}
                  />
                </span>
                <span className="tabular-nums text-foreground">{cell.left}%</span>
              </span>
            ))}
            <span className="truncate text-right">
              {line.resetsAt ? formatResetCountdown(line.resetsAt - now) : ''}
            </span>
          </div>
        ))
      )}
    </div>
  )
}
