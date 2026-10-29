import { useEffect, useMemo, useState } from 'react'
import type { CodexUsageRange } from '../../../../shared/codex-usage-types'
import { buildUsageOverview } from '../stats/usage-overview-model'
import type { UsageOverviewInput } from '../stats/usage-overview-types'

const EMPTY_USAGE: UsageOverviewInput = {
  claude: { scanState: null, summary: null, daily: [] },
  codex: { scanState: null, summary: null, daily: [] },
  opencode: { scanState: null, summary: null, daily: [] },
  muse: { scanState: null, summary: null, daily: [] }
}

export function useDeckUsageOverview(range: CodexUsageRange, revision: number) {
  const [snapshot, setSnapshot] = useState({ range, input: EMPTY_USAGE })
  const input = snapshot.range === range ? snapshot.input : EMPTY_USAGE
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const query = { scope: 'all', range } as const
    // Why: the Deck panel tracks Claude and Codex only, so other providers stay out of the total.
    void Promise.allSettled([
      window.api.claudeUsage.getSnapshot(query),
      window.api.codexUsage.getSnapshot(query)
    ]).then(([claude, codex]) => {
      if (cancelled) {
        return
      }
      setSnapshot((previous) => {
        const fallback = previous.range === range ? previous.input : EMPTY_USAGE
        return {
          range,
          input: {
            claude: claude.status === 'fulfilled' && claude.value ? claude.value : fallback.claude,
            codex: codex.status === 'fulfilled' && codex.value ? codex.value : fallback.codex,
            opencode: EMPTY_USAGE.opencode,
            muse: EMPTY_USAGE.muse
          }
        }
      })
      if ([claude, codex].some((result) => result.status === 'rejected' || !result.value)) {
        setError('Some local usage data is unavailable. Retry or open usage settings.')
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [range, revision])

  const overview = useMemo(() => buildUsageOverview(input), [input])
  return { overview, loading, error }
}
