import { describe, expect, it } from 'vitest'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'
import { buildAgyQuotaLines, describeAgyBuckets } from './deck-antigravity-quota-model'

const bucket = (group: string | undefined, windowName: string, used: number, resetsAt: number) => ({
  name: windowName,
  group,
  windowName,
  usedPercent: used,
  windowMinutes: /Five/.test(windowName) ? 300 : 10080,
  resetsAt,
  resetDescription: null
})

const usage = {
  provider: 'antigravity',
  session: null,
  weekly: null,
  buckets: [
    bucket('Gemini Models', 'Weekly Limit Remaining', 2, 500),
    bucket('Gemini Models', 'Five Hour Limit Remaining', 2, 100),
    bucket('Claude and GPT models', 'Weekly Limit Remaining', 0, 600),
    bucket('Claude and GPT models', 'Five Hour Limit Remaining', 40, 200),
    bucket(undefined, 'wk', 2, 500)
  ],
  updatedAt: 0,
  error: null,
  status: 'ok'
} as ProviderRateLimits

describe('buildAgyQuotaLines', () => {
  it('folds the four agy pools into 5h and weekly lines and drops the ungrouped duplicate', () => {
    expect(buildAgyQuotaLines(usage)).toEqual([
      {
        span: '5h',
        cells: [
          { pool: 'G', left: 98, resetsAt: 100 },
          { pool: 'C', left: 60, resetsAt: 200 }
        ],
        // The tighter pool (Claude/GPT, 60% left) decides the reset shown.
        resetsAt: 200
      },
      {
        span: 'wk',
        cells: [
          { pool: 'G', left: 98, resetsAt: 500 },
          { pool: 'C', left: 100, resetsAt: 600 }
        ],
        resetsAt: 500
      }
    ])
  })

  it('returns no lines without buckets', () => {
    expect(buildAgyQuotaLines(null)).toEqual([])
    expect(describeAgyBuckets(usage).split('\n')).toHaveLength(4)
  })
})
