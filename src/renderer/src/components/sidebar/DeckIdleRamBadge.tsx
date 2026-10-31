import { useEffect, useMemo, useState } from 'react'
import { Moon } from 'lucide-react'
import { useAppStore } from '@/store'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useResourceViewVisible } from '../status-bar/use-resource-view-visible'
import {
  formatDeckIdleBytes,
  formatDeckIdleDuration,
  summarizeDeckIdleRam
} from '@/lib/deck-idle-ram'

// Why: the idle service samples once a minute, so a slower refresh costs one ps sweep per interval.
const REFRESH_MS = 30_000
// Reuse a snapshot the resource view fetched recently instead of sweeping again.
const FRESH_MS = 20_000

function useIdleRamSnapshotRefresh(): void {
  const visible = useResourceViewVisible()
  useEffect(() => {
    if (!visible) {
      return
    }
    let disposed = false
    const refresh = (): void => {
      const current = useAppStore.getState().memorySnapshot
      if (current && Date.now() - current.collectedAt < FRESH_MS) {
        return
      }
      void window.api.memory
        .getSnapshot()
        .then((snapshot) => {
          if (!disposed) {
            useAppStore.setState({ memorySnapshot: snapshot })
          }
        })
        .catch(() => {})
    }
    refresh()
    const timer = window.setInterval(refresh, REFRESH_MS)
    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [visible])
}

/** Quiet dock badge for idle agent/terminal tabs; renders nothing when none are idle. */
export function DeckIdleRamBadge(): React.JSX.Element | null {
  useIdleRamSnapshotRefresh()
  const snapshot = useAppStore((s) => s.memorySnapshot)
  const statusByPaneKey = useAppStore((s) => s.agentStatusByPaneKey)
  const summary = useMemo(
    () => summarizeDeckIdleRam(snapshot, statusByPaneKey),
    [snapshot, statusByPaneKey]
  )
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => setNow(Date.now()), [snapshot])
  if (summary.rows.length === 0) {
    return null
  }
  const frozen = summary.rows.filter((row) => row.frozen).length
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="deck-idle-ram-badge"
          tabIndex={0}
          role="status"
          aria-label={`${summary.rows.length} idle tabs holding ${formatDeckIdleBytes(summary.memory)} RAM`}
        >
          <Moon className="size-3" aria-hidden />
          {summary.rows.length}
          <span aria-hidden>·</span>
          {formatDeckIdleBytes(summary.memory)}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="end">
        <div className="deck-idle-ram-tooltip">
          <div className="deck-idle-ram-tooltip-head">
            {summary.rows.length} idle · {frozen} frozen · RAM {formatDeckIdleBytes(summary.memory)}
            {' · '}swap {formatDeckIdleBytes(summary.swap)}
          </div>
          <ul>
            {summary.rows.map((row) => (
              <li key={row.key}>
                <span className="deck-idle-ram-tooltip-label">{row.label}</span>
                <span className="deck-idle-ram-tooltip-meta">
                  {formatDeckIdleBytes(row.memory)} + {formatDeckIdleBytes(row.swap)} swap ·{' '}
                  {formatDeckIdleDuration(now - row.idleSince)}
                  {row.frozen ? ' · frozen' : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
