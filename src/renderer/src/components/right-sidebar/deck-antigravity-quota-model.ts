import type { ProviderRateLimits, RateLimitBucket } from '../../../../shared/rate-limit-types'

export type AgyPool = 'G' | 'C'
export type AgySpan = '5h' | 'wk'
export type AgyCell = { pool: AgyPool; left: number; resetsAt: number | null }
export type AgyQuotaLine = { span: AgySpan; cells: AgyCell[]; resetsAt: number | null }

function poolOf(bucket: RateLimitBucket): AgyPool | null {
  if (!bucket.group) {
    // Why: agy also reports an ungrouped weekly pool that repeats the Gemini weekly figure.
    return null
  }
  return /gemini/i.test(bucket.group) ? 'G' : 'C'
}

function spanOf(bucket: RateLimitBucket): AgySpan {
  if (/five|5\s*h/i.test(bucket.windowName ?? bucket.name)) {
    return '5h'
  }
  if (/week/i.test(bucket.windowName ?? bucket.name)) {
    return 'wk'
  }
  return bucket.windowMinutes > 0 && bucket.windowMinutes <= 600 ? '5h' : 'wk'
}

/** Folds agy's model-group pools into two lines (5h, weekly) of Gemini and Claude/GPT cells. */
export function buildAgyQuotaLines(usage: ProviderRateLimits | null | undefined): AgyQuotaLine[] {
  const buckets = usage?.buckets ?? []
  const lines: AgyQuotaLine[] = []
  for (const span of ['5h', 'wk'] as const) {
    const cells: AgyCell[] = []
    for (const pool of ['G', 'C'] as const) {
      const match = buckets.filter((b) => poolOf(b) === pool && spanOf(b) === span)
      if (match.length === 0) {
        continue
      }
      // Several pools in one group: the tightest one decides what is left.
      const tight = match.reduce((a, b) => (b.usedPercent > a.usedPercent ? b : a))
      cells.push({
        pool,
        left: Math.max(0, Math.min(100, Math.round(100 - tight.usedPercent))),
        resetsAt: tight.resetsAt
      })
    }
    if (cells.length > 0) {
      const lowest = cells.reduce((a, b) => (b.left < a.left ? b : a))
      lines.push({ span, cells, resetsAt: lowest.resetsAt })
    }
  }
  return lines
}

/** Every pool as one line each, for the hover title. */
export function describeAgyBuckets(usage: ProviderRateLimits | null | undefined): string {
  return (usage?.buckets ?? [])
    .filter((b) => b.group)
    .map((b) => `${b.group} · ${b.windowName ?? b.name}: ${Math.round(100 - b.usedPercent)}% left`)
    .join('\n')
}
