import { useEffect, useState } from 'react'
import { ChevronDown, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useAppStore } from '@/store'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { AgentIcon } from '@/lib/agent-catalog'
import { getCodexAccountDisplayLabel } from '@/lib/codex-account-display-label'
import { formatWindowLabel } from '@/lib/window-label-formatter'
import { useResetCountdownClock } from '@/hooks/useResetCountdownClock'
import { formatResetCountdown, getWindowSections } from '../status-bar/tooltip'
import { getUsageRosterRowState } from '../status-bar/usage-roster-row-state'
import { clampUsedPercent } from '../../../../shared/usage-percentage-display'
import type { InactiveAccountUsage, ProviderRateLimits } from '../../../../shared/rate-limit-types'

type QuotaProvider = 'claude' | 'codex'

type QuotaAccountRow = {
  key: string
  label: string | undefined
  usage: ProviderRateLimits | null
  fetching: boolean
  active: boolean
}

/** Quota windows of every managed Claude and Codex account, active account first. */
export function DeckQuotaBlock(): React.JSX.Element | null {
  const [open, setOpen] = useState(true)
  const settings = useAppStore((s) => s.settings)
  const claude = useAppStore((s) => s.rateLimits?.claude)
  const codex = useAppStore((s) => s.rateLimits?.codex)
  const inactiveClaude = useAppStore((s) => s.rateLimits?.inactiveClaudeAccounts)
  const inactiveCodex = useAppStore((s) => s.rateLimits?.inactiveCodexAccounts)
  const claudeAccounts = settings?.claudeManagedAccounts
  const codexAccounts = settings?.codexManagedAccounts
  const hasOtherAccounts = (claudeAccounts?.length ?? 0) > 1 || (codexAccounts?.length ?? 0) > 1
  useEffect(() => {
    // Why: the main-side probe is cached and debounced, so a mount-time request is cheap.
    if (!hasOtherAccounts) {
      return
    }
    const state = useAppStore.getState()
    void state.fetchInactiveClaudeAccountUsage()
    void state.fetchInactiveCodexAccountUsage()
  }, [hasOtherAccounts])
  useEffect(() => {
    if (!open) {
      return
    }
    let disposed = false
    let pending = false
    const refresh = async (): Promise<void> => {
      if (document.visibilityState === 'hidden' || pending) {
        return
      }
      pending = true
      try {
        const limits = await window.api.rateLimits.get({ refreshQuota: true })
        if (!disposed) {
          useAppStore.getState().setRateLimitsFromPush(limits)
        }
      } catch (error) {
        console.warn('Could not refresh account quota:', error)
      } finally {
        pending = false
      }
    }
    const onVisibilityChange = (): void => {
      void refresh()
    }
    const timer = window.setInterval(() => void refresh(), 30_000)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      disposed = true
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [open])
  const claudeId =
    settings?.activeClaudeManagedAccountIdsByRuntime?.host ?? settings?.activeClaudeManagedAccountId
  const codexId =
    settings?.activeCodexManagedAccountIdsByRuntime?.host ?? settings?.activeCodexManagedAccountId
  const claudeRows = buildRows(
    claude ?? null,
    claudeId,
    (claudeAccounts ?? []).map((account) => ({ id: account.id, label: account.email })),
    inactiveClaude
  )
  const codexRows = buildRows(
    codex ?? null,
    codexId,
    (codexAccounts ?? []).map((account) => ({
      id: account.id,
      label: getCodexAccountDisplayLabel(account, codexAccounts ?? [])
    })),
    inactiveCodex
  )
  if (claudeRows.length === 0 && codexRows.length === 0) {
    return null
  }
  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <section
        className="deck-usage-quota border-t border-sidebar-border pt-1.5"
        aria-label="Account quota"
      >
        <div className="deck-usage-quota-head">
          <CollapsibleTrigger className="flex cursor-pointer items-center gap-1.5 text-[13px] font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
            {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            Quota
          </CollapsibleTrigger>
        </div>
        <CollapsibleContent>
          <div className="mt-1 divide-y divide-sidebar-border">
            {claudeRows.map((row) => (
              <QuotaRows key={row.key} provider="claude" row={row} />
            ))}
            {codexRows.map((row) => (
              <QuotaRows key={row.key} provider="codex" row={row} />
            ))}
          </div>
        </CollapsibleContent>
      </section>
    </Collapsible>
  )
}

function buildRows(
  activeUsage: ProviderRateLimits | null,
  activeId: string | null | undefined,
  accounts: { id: string; label: string }[],
  inactive: InactiveAccountUsage[] | undefined
): QuotaAccountRow[] {
  const rows: QuotaAccountRow[] = []
  if (activeUsage) {
    rows.push({
      key: activeId ?? 'default',
      label: accounts.find((account) => account.id === activeId)?.label,
      usage: activeUsage,
      fetching: activeUsage.status === 'fetching',
      active: true
    })
  }
  for (const account of accounts) {
    if (account.id === activeId) {
      continue
    }
    const preview = inactive?.find((entry) => entry.accountId === account.id)
    rows.push({
      key: account.id,
      label: account.label,
      usage: preview?.rateLimits ?? null,
      fetching: preview?.isFetching ?? !preview,
      active: false
    })
  }
  return rows
}

function QuotaRows({
  provider,
  row
}: {
  provider: QuotaProvider
  row: QuotaAccountRow
}): React.JSX.Element {
  const { label, usage } = row
  const sections = usage ? getWindowSections(usage).filter((section) => section.window) : []
  const now = useResetCountdownClock(sections.map((section) => section.window?.resetsAt))
  const refreshing = row.fetching
  return (
    <div
      data-quota-provider={provider}
      data-quota-active={row.active ? 'true' : undefined}
      className="space-y-0.5 py-1.5"
    >
      <div className="flex items-center gap-1.5 text-[12px]">
        <AgentIcon agent={provider} size={13} />
        <span
          className={cn('min-w-0 flex-1 truncate', !row.active && 'text-muted-foreground')}
          title={row.active ? `${label ?? 'Default account'} (active)` : label}
        >
          {label?.split('@')[0] ?? 'Default account'}
        </span>
        {row.active ? <span className="deck-quota-active-dot" aria-label="Active account" /> : null}
        {refreshing ? (
          <Loader2 className="size-3 animate-spin text-muted-foreground" aria-label="Updating" />
        ) : null}
      </div>
      {sections.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">
          {refreshing
            ? 'Updating…'
            : usage
              ? getUsageRosterRowState(usage, false).statusLabel
              : 'No usage data yet'}
        </p>
      ) : (
        sections.map(({ label: sectionLabel, window }) => {
          if (!window) {
            return null
          }
          const left = 100 - clampUsedPercent(window.usedPercent)
          const duration = usage?.buckets?.some((bucket) => bucket.name === sectionLabel)
            ? sectionLabel
            : formatWindowLabel(window.windowMinutes)
          const reset = window.resetsAt ? formatResetCountdown(window.resetsAt - now) : null
          return (
            <div key={sectionLabel} className="deck-quota-window text-[11px] text-muted-foreground">
              <span>{duration}</span>
              <span className="tabular-nums text-foreground">{Math.round(left)}%</span>
              <div
                className="deck-cost-track"
                role="meter"
                aria-label={`${duration} quota left`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={left}
              >
                <div className="deck-quota-fill" style={{ width: `${left}%` }} />
              </div>
              <span className="truncate text-right">{reset ?? ''}</span>
            </div>
          )
        })
      )}
    </div>
  )
}
