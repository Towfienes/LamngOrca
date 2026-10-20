import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { CodexUsageRange } from '../../../../shared/codex-usage-types'
import { useAppStore } from '@/store'
import { AgentIcon } from '@/lib/agent-catalog'
import { Button } from '../ui/button'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip'
import { formatUsageCost, formatUsageTokens } from '../stats/usage-overview-model'
import { useDeckUsageOverview } from './use-deck-usage-overview'

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
  const scanRevision = useAppStore(
    (state) =>
      (state.claudeUsageScanState?.lastScanCompletedAt ?? 0) +
      (state.codexUsageScanState?.lastScanCompletedAt ?? 0) +
      (state.openCodeUsageScanState?.lastScanCompletedAt ?? 0) +
      (state.museUsageScanState?.lastScanCompletedAt ?? 0)
  )
  const { overview, loading, error } = useDeckUsageOverview(range, revision + scanRevision)
  const openSettingsPage = useAppStore((state) => state.openSettingsPage)
  const providers = overview.providers.filter((provider) => provider.enabled || provider.hasData)

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
        providers.some((p) => p.id === 'codex' && p.enabled)
          ? state.refreshCodexUsage()
          : undefined,
        providers.some((p) => p.id === 'opencode' && p.enabled)
          ? state.refreshOpenCodeUsage()
          : undefined,
        providers.some((p) => p.id === 'muse' && p.enabled) ? state.refreshMuseUsage() : undefined
      ])
      setRevision((value) => value + 1)
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : 'Could not refresh local usage.')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div
      className="deck-usage-panel min-h-0 max-h-[50%] shrink space-y-3 overflow-y-auto border-t border-sidebar-border bg-sidebar p-3 text-sidebar-foreground scrollbar-sleek"
      aria-label="Usage panel"
      aria-busy={loading || refreshing}
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
        className="mb-3 w-full"
      >
        {RANGES.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value} className="flex-1">
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <section className="deck-usage-cost text-popover-foreground" aria-label="Estimated API cost">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">Estimated API cost</span>
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
        </div>
        <p
          className="deck-usage-total mt-1 text-3xl leading-tight font-semibold tabular-nums"
          aria-live="polite"
        >
          {formatUsageCost(overview.estimatedCostUsd)}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          API equivalent, not your subscription bill
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">From local agent logs</p>
        <div className="mt-4 space-y-4">
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
                  className="deck-cost-track mt-2"
                  role="meter"
                  aria-label={`${provider.label} share of estimated cost`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={share}
                >
                  <div className="deck-cost-fill" style={{ width: `${share}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {provider.estimatedCostUsd === null
                    ? 'Cost unavailable'
                    : `${share.toFixed(1)}% of cost`}{' '}
                  · {formatUsageTokens(provider.totalTokens)} tokens
                </p>
                {provider.lastScanError && (
                  <p className="mt-1 text-xs text-destructive">{provider.lastScanError}</p>
                )}
              </div>
            )
          })}
        </div>
        {!loading && providers.length === 0 && (
          <p className="mt-4 text-xs text-muted-foreground">
            Enable usage tracking in Settings to read your local agent logs.
          </p>
        )}
        {overview.hasPartialCost && (
          <p className="mt-3 text-xs text-muted-foreground">
            Some model prices are unavailable; the total excludes those tokens.
          </p>
        )}
        {error && (
          <p className="mt-3 text-xs text-destructive" role="status">
            {error}
          </p>
        )}
        <Button
          variant="link"
          size="xs"
          onClick={() => {
            useAppStore.getState().openSettingsTarget({ pane: 'stats', repoId: null })
            openSettingsPage()
          }}
          className="mt-3"
        >
          Usage settings
        </Button>
      </section>
    </div>
  )
}
