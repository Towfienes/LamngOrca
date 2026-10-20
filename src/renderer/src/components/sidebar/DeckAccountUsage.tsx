import { getWindowSections, formatResetCountdown } from '../status-bar/tooltip'
import { getUsageRosterRowState } from '../status-bar/usage-roster-row-state'
import { formatWindowLabel } from '@/lib/window-label-formatter'
import { useResetCountdownClock } from '@/hooks/useResetCountdownClock'
import { clampUsedPercent } from '../../../../shared/usage-percentage-display'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'

export function DeckAccountUsage({
  usage
}: {
  usage: ProviderRateLimits | null
}): React.JSX.Element {
  const sections = usage ? getWindowSections(usage).filter((s) => s.window) : []
  const now = useResetCountdownClock(sections.map((s) => s.window?.resetsAt))
  if (!usage || sections.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {usage ? getUsageRosterRowState(usage, false).statusLabel : 'Usage not loaded'}
      </p>
    )
  }
  return (
    <div className="space-y-2" aria-label="Account usage">
      {sections.map(({ label, window }) => {
        if (!window) {
          return null
        }
        const left = 100 - clampUsedPercent(window.usedPercent)
        const reset = window.resetsAt ? formatResetCountdown(window.resetsAt - now) : null
        const duration = usage.buckets?.some((b) => b.name === label)
          ? label
          : formatWindowLabel(window.windowMinutes)
        return (
          <div key={label} className="space-y-1">
            <div className="flex justify-between gap-2 text-xs text-muted-foreground">
              <span>{duration}</span>
              <span className="tabular-nums text-foreground">{Math.round(left)}% left</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${left}%` }} />
            </div>
            {reset ? <p className="text-[11px] text-muted-foreground">{reset}</p> : null}
          </div>
        )
      })}
    </div>
  )
}
