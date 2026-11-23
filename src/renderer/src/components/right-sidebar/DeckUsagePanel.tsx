import { useEffect, useLayoutEffect, useState } from 'react'
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { CodexUsageRange } from '../../../../shared/codex-usage-types'
import { useAppStore } from '@/store'
import { AgentIcon } from '@/lib/agent-catalog'
import { Button } from '../ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { formatUsageCost, formatUsageTokens } from '../stats/usage-overview-model'
import { enableDeckUsageTrackingOnce } from './deck-usage-tracking'
import { useDeckUsageOverview } from './use-deck-usage-overview'
import { DeckQuotaBlock } from './DeckQuotaBlock'
import { DeckIssuesBalloon } from './DeckIssuesBalloon'
import { BorutoKarmaPortrait } from './BorutoKarmaPortrait'
import { useDeckAssignedIssues } from './use-deck-assigned-issues'
import { Popover, PopoverArrow, PopoverContent, PopoverTrigger } from '../ui/popover'
import '@/assets/manga-notes.css'

const RANGES: { value: CodexUsageRange; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All' }
]

// Content width the panel is laid out for; narrower docks scale it down instead of reflowing it.
const USAGE_DESIGN_WIDTH = 248
const USAGE_MIN_SCALE = 0.6

function useUsageFitScale(node: HTMLElement | null): number {
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    if (!node) {
      return
    }
    const update = (): void => {
      const fit = Math.round((node.clientWidth / USAGE_DESIGN_WIDTH) * 100) / 100
      setScale(Math.min(1, Math.max(USAGE_MIN_SCALE, fit)))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [node])
  return scale
}

export default function DeckUsagePanel(): React.JSX.Element {
  const [issuesOpen, setIssuesOpen] = useState(false)
  const assigned = useDeckAssignedIssues()
  const [range, setRange] = useState<CodexUsageRange>('all')
  const [revision, setRevision] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [open, setOpen] = useState(true)
  const [scrollNode, setScrollNode] = useState<HTMLDivElement | null>(null)
  const scale = useUsageFitScale(scrollNode)
  const scanRevision = useAppStore(
    (state) =>
      (state.claudeUsageScanState?.lastScanCompletedAt ?? 0) +
      (state.codexUsageScanState?.lastScanCompletedAt ?? 0)
  )
  const { overview, loading, error } = useDeckUsageOverview(range, revision + scanRevision)
  const providers = overview.providers.filter(
    (provider) =>
      (provider.id === 'claude' || provider.id === 'codex') &&
      (provider.enabled || provider.hasData)
  )

  useEffect(() => {
    if (!open) {
      return
    }
    // Why: getSnapshot only reads the last scan, so without a rescan the cost froze until a
    // manual refresh. Scans are incremental (unchanged log files are reused), so a minute is cheap.
    let pending = false
    const rescan = async (): Promise<void> => {
      if (pending || document.visibilityState === 'hidden') {
        return
      }
      pending = true
      try {
        if (await enableDeckUsageTrackingOnce()) {
          return
        }
        const state = useAppStore.getState()
        // Why: scan state is empty after an app restart until a fetch loads it from main.
        await Promise.allSettled([
          state.claudeUsageScanState?.enabled
            ? state.refreshClaudeUsage()
            : state.fetchClaudeUsage(),
          state.codexUsageScanState?.enabled ? state.refreshCodexUsage() : state.fetchCodexUsage()
        ])
      } finally {
        pending = false
      }
    }
    void rescan()
    const timer = window.setInterval(() => void rescan(), 60_000)
    const onVisible = (): void => void rescan()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [open])

  const refresh = async (): Promise<void> => {
    if (refreshing) {
      return
    }
    setRefreshing(true)
    try {
      const state = useAppStore.getState()
      await Promise.all([
        providers.some((p) => p.id === 'claude' && p.enabled)
          ? state.refreshClaudeUsage()
          : undefined,
        providers.some((p) => p.id === 'codex' && p.enabled) ? state.refreshCodexUsage() : undefined
      ])
      setRevision((value) => value + 1)
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : 'Could not refresh local usage.')
    } finally {
      setRefreshing(false)
    }
  }

  const refreshButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          disabled={loading || refreshing}
          onClick={() => void refresh()}
          aria-label="Refresh local usage"
        >
          <RefreshCw className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Refresh local usage</TooltipContent>
    </Tooltip>
  )

  return (
    <Collapsible open={open} onOpenChange={setOpen} asChild>
      <div
        className="deck-usage-panel relative isolate flex min-h-0 max-h-[50%] shrink flex-col gap-2 border-t border-sidebar-border bg-sidebar px-2 pt-2 pb-2 text-sidebar-foreground"
        aria-label="Usage panel"
        aria-busy={loading || refreshing}
        data-usage-open={open ? '' : undefined}
      >
        <div className="flex items-center justify-between gap-1">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="xs" className="-ml-2">
              {open ? <ChevronDown /> : <ChevronRight />}
              Usage
            </Button>
          </CollapsibleTrigger>
          {refreshButton}
        </div>
        <CollapsibleContent asChild>
          <div className="flex min-h-0 flex-col gap-2">
            <div ref={setScrollNode} className="deck-usage-scroll min-h-0" data-usage-scroll>
              <div style={{ zoom: scale }} data-usage-scale={scale}>
                <ToggleGroup
                  type="single"
                  size="xs"
                  value={range}
                  onValueChange={(value) => {
                    if (value === '7d' || value === '30d' || value === '90d' || value === 'all') {
                      setRange(value)
                    }
                  }}
                  aria-label="Usage period"
                  className="mb-2 w-full"
                >
                  {RANGES.map((option) => (
                    <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
                      {option.label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <div className="deck-usage-top">
                  <section
                    className="deck-usage-cost min-w-0 text-popover-foreground"
                    aria-label="Estimated API cost"
                  >
                    <span className="block truncate text-[11px] text-muted-foreground">
                      Estimated API cost
                    </span>
                    <p
                      className="deck-usage-total text-2xl leading-tight font-semibold tabular-nums"
                      aria-live="polite"
                    >
                      {formatUsageCost(overview.estimatedCostUsd)}
                    </p>
                    <p
                      className="whitespace-nowrap text-[11px] leading-4 text-muted-foreground"
                      title="API-equivalent cost from local agent logs; not your subscription bill"
                    >
                      API equivalent · local logs
                    </p>
                    <div className="mt-2 space-y-2">
                      {providers.map((provider) => {
                        const share =
                          overview.estimatedCostUsd && provider.estimatedCostUsd !== null
                            ? (provider.estimatedCostUsd / overview.estimatedCostUsd) * 100
                            : 0
                        return (
                          <div key={provider.id} data-usage-provider={provider.id}>
                            <div className="flex items-center gap-1 text-[13px]">
                              <AgentIcon agent={provider.id} size={16} />
                              <span className="min-w-0 flex-1 truncate">{provider.label}</span>
                              <span className="shrink-0 tabular-nums">
                                {formatUsageCost(provider.estimatedCostUsd)}
                              </span>
                            </div>
                            <div
                              className="deck-cost-track mt-1"
                              role="meter"
                              aria-label={`${provider.label} share of estimated cost`}
                              aria-valuemin={0}
                              aria-valuemax={100}
                              aria-valuenow={share}
                            >
                              <div className="deck-cost-fill" style={{ width: `${share}%` }} />
                            </div>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                              {provider.estimatedCostUsd === null
                                ? 'Cost unavailable'
                                : `${share.toFixed(1)}%`}{' '}
                              · {formatUsageTokens(provider.totalTokens)} tokens
                            </p>
                            {provider.lastScanError && (
                              <p className="mt-1 text-xs text-destructive">
                                {provider.lastScanError}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </section>
                  <div className="deck-usage-figure">
                    <Popover
                      open={issuesOpen}
                      onOpenChange={(next) => {
                        setIssuesOpen(next)
                        if (next) {
                          assigned.refresh()
                        }
                      }}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="deck-usage-portrait-button"
                              aria-label="Mở danh sách issue"
                            >
                              <BorutoKarmaPortrait awake={assigned.issues.length > 0} />
                            </button>
                          </PopoverTrigger>
                        </TooltipTrigger>
                        <TooltipContent>
                          {assigned.issues.length > 0
                            ? `${assigned.issues.length} issue đang mở`
                            : 'Không có issue đang mở'}
                        </TooltipContent>
                      </Tooltip>
                      <PopoverContent
                        aria-label="Issues của tôi"
                        side="top"
                        align="center"
                        sideOffset={8}
                        collisionPadding={12}
                        data-manga-notes
                        wheelScroll
                      >
                        <DeckIssuesBalloon
                          issues={assigned.issues}
                          loading={assigned.loading}
                          refreshing={assigned.refreshing}
                          error={assigned.error}
                          updatedAt={assigned.updatedAt}
                          onRefresh={() => assigned.refresh(true)}
                          onClose={() => setIssuesOpen(false)}
                        />
                        <PopoverArrow data-manga-tail width={22} height={14} />
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
                <DeckQuotaBlock />
                {overview.hasPartialCost && (
                  <p className="mt-3 text-[11px] text-muted-foreground">Unpriced usage excluded.</p>
                )}
                {error && (
                  <p className="mt-3 text-[11px] text-destructive" role="status">
                    {error}
                  </p>
                )}
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
