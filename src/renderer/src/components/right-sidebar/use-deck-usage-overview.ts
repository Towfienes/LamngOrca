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
  const [input, setInput] = useState(EMPTY_USAGE)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setInput(EMPTY_USAGE)
    const query = { scope: 'all', range } as const
    void Promise.allSettled([
      window.api.claudeUsage.getSnapshot(query),
      window.api.codexUsage.getSnapshot(query),
      window.api.openCodeUsage.getSnapshot(query),
      window.api.museUsage.getSnapshot(query)
    ]).then(([claude, codex, opencode, muse]) => {
      if (cancelled) {
        return
      }
      setInput({
        claude: claude.status === 'fulfilled' && claude.value ? claude.value : EMPTY_USAGE.claude,
        codex: codex.status === 'fulfilled' && codex.value ? codex.value : EMPTY_USAGE.codex,
        opencode:
          opencode.status === 'fulfilled' && opencode.value ? opencode.value : EMPTY_USAGE.opencode,
        muse: muse.status === 'fulfilled' && muse.value ? muse.value : EMPTY_USAGE.muse
      })
      if (
        [claude, codex, opencode, muse].some(
          (result) => result.status === 'rejected' || !result.value
        )
      ) {
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
