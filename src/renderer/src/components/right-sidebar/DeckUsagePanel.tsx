import { useState } from 'react'
import { ArrowRight, ChevronDown, ChevronRight, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { CodexUsageRange } from '../../../../shared/codex-usage-types'
import { useAppStore } from '@/store'
import { AgentIcon } from '@/lib/agent-catalog'
import { Button } from '../ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../ui/collapsible'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { formatUsageCost, formatUsageTokens } from '../stats/usage-overview-model'
import { useDeckUsageOverview } from './use-deck-usage-overview'
import { DeckQuotaBlock } from './DeckQuotaBlock'
import davidPortrait from '@/assets/david-laid-portrait.webp'

const RANGES: { value: CodexUsageRange; label: string }[] = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'all', label: 'All' }
]

export default function DeckUsagePanel(): React.JSX.Element {
  const [range, setRange] = useState<CodexUsageRange>('all')
  const [revision, setRevision] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [open, setOpen] = useState(true)
  const scanRevision = useAppStore(
    (state) =>
      (state.claudeUsageScanState?.lastScanCompletedAt ?? 0) +
      (state.codexUsageScanState?.lastScanCompletedAt ?? 0)
  )
  const { overview, loading, error } = useDeckUsageOverview(range, revision + scanRevision)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const providers = overview.providers.filter(
    (provider) =>
      (provider.id === 'claude' || provider.id === 'codex') &&
      (provider.enabled || provider.hasData)
  )

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
        className="deck-usage-panel relative isolate flex min-h-0 max-h-[50%] shrink flex-col gap-2 border-t border-sidebar-border bg-sidebar px-3 pt-2 pb-2 text-sidebar-foreground"
        aria-label="Usage panel"
        aria-busy={loading || refreshing}
        data-usage-open={open ? '' : undefined}
      >
        <div className="flex items-center justify-between gap-1">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="xs">
              {open ? <ChevronDown /> : <ChevronRight />}
              Usage
            </Button>
          </CollapsibleTrigger>
          {refreshButton}
        </div>
        <CollapsibleContent asChild>
          <div className="flex min-h-0 flex-col gap-2">
            {/* Why: decorative and pointer-transparent, so it never covers the figures beside it. */}
            <figure className="deck-david-brand">
              <figcaption className="deck-david-caption">01 / Sculpture</figcaption>
              <img
                src={davidPortrait}
                alt="David Laid"
                className="deck-david-portrait"
                decoding="async"
                draggable={false}
              />
            </figure>
            <div
              className="relative z-10 min-h-0 overflow-y-auto scrollbar-sleek"
              data-usage-scroll
            >
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
                className="mb-2.5 w-full"
              >
                {RANGES.map((option) => (
                  <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
                    {option.label}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
              <section
                className="deck-usage-cost text-popover-foreground"
                aria-label="Estimated API cost"
              >
                <span className="text-[11px] text-muted-foreground">Estimated API cost</span>
                <p
                  className="deck-usage-total text-2xl leading-tight font-semibold tabular-nums"
                  aria-live="polite"
                >
                  {formatUsageCost(overview.estimatedCostUsd)}
                </p>
                <p className="deck-usage-note text-[11px] leading-4 text-muted-foreground">
                  API equivalent · not your subscription bill
                  <br />
                  From local agent logs
                </p>
                <div className="deck-usage-provider-list mt-3 space-y-3">
                  {providers.map((provider) => {
                    const share =
                      overview.estimatedCostUsd && provider.estimatedCostUsd !== null
                        ? (provider.estimatedCostUsd / overview.estimatedCostUsd) * 100
                        : 0
                    return (
                      <div key={provider.id} data-usage-provider={provider.id}>
                        <div className="flex items-center gap-2 text-[13px]">
                          <AgentIcon agent={provider.id} size={16} />
                          <span className="min-w-0 flex-1 truncate">{provider.label}</span>
                          <span className="shrink-0 tabular-nums">
                            {formatUsageCost(provider.estimatedCostUsd)}
                          </span>
                        </div>
                        <div
                          className="deck-cost-track mt-1.5"
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
                          <p className="mt-1 text-xs text-destructive">{provider.lastScanError}</p>
                        )}
                      </div>
                    )
                  })}
                </div>
                <DeckQuotaBlock />
                {!loading && providers.length === 0 && (
                  <p className="deck-usage-note mt-3 text-[11px] text-muted-foreground">
                    Enable usage tracking in Settings to read your local agent logs.
                  </p>
                )}
                {overview.hasPartialCost && (
                  <p className="deck-usage-note mt-3 text-[11px] text-muted-foreground">
                    Unpriced usage excluded.
                  </p>
                )}
                {error && (
                  <p className="deck-usage-note mt-3 text-[11px] text-destructive" role="status">
                    {error}
                  </p>
                )}
              </section>
            </div>
            <div className="deck-usage-footer relative z-10">
              <Button
                variant="link"
                size="xs"
                onClick={() => {
                  useAppStore.getState().openSettingsTarget({ pane: 'stats', repoId: null })
                  openSettingsPage()
                }}
              >
                Usage settings
                <ArrowRight aria-hidden />
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  )
}
