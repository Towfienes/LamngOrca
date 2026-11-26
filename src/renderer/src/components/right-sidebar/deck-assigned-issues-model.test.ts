import { describe, expect, it } from 'vitest'
import {
  flattenAssignedIssues,
  formatIssueAge,
  issuePriority,
  mergeRepoOutcomes,
  repoFullNameFromIssueUrl,
  type AssignedIssuesState,
  type RepoIssuesOutcome
} from './deck-assigned-issues-model'

const EMPTY: AssignedIssuesState = { byRepo: {}, skipped: [], error: null }
const source = { owner: 'bminhnemhoi', repo: 'docset-check' }

function item(number: number, labels: string[], updatedAt: string) {
  return {
    id: String(number),
    type: 'issue' as const,
    number,
    title: `Issue ${number}`,
    state: 'open' as const,
    url: `https://github.com/bminhnemhoi/docset-check/issues/${number}`,
    labels,
    updatedAt,
    author: 'an'
  }
}

type Item = Omit<ReturnType<typeof item>, 'type'> & { type: 'issue' | 'pr' }

function ok(repoId: string, items: Item[], reviewItems: Item[] = []): RepoIssuesOutcome {
  const sources = { issues: source, prs: source }
  return {
    repoId,
    kind: 'ok',
    assigned: { items, sources },
    review: { items: reviewItems, sources }
  }
}

function pr(number: number): Item {
  return {
    ...item(number, [], '2026-11-24T10:00:00Z'),
    type: 'pr',
    url: `https://github.com/Towfienes/Momo-Techday/pull/${number}`
  }
}

describe('issuePriority', () => {
  it('reads the lowest P-label and ignores other labels', () => {
    expect(issuePriority(['area:web', 'P1', 'p0'])).toBe(0)
    expect(issuePriority(['priority: P2'])).toBe(2)
    expect(issuePriority(['owner:tien', 'workstream'])).toBeNull()
  })
})

describe('repoFullNameFromIssueUrl', () => {
  it('takes owner/name from a GitHub issue URL', () => {
    expect(repoFullNameFromIssueUrl('https://github.com/bminhnemhoi/docset-check/issues/56')).toBe(
      'bminhnemhoi/docset-check'
    )
    expect(repoFullNameFromIssueUrl('https://example.com/x')).toBe('')
  })
})

describe('mergeRepoOutcomes', () => {
  it('sorts P0 before P1 before unlabelled, newest first within a priority', () => {
    const state = mergeRepoOutcomes(EMPTY, [
      ok('r1', [
        item(114, ['P1'], '2026-11-15T05:00:00Z'),
        item(10, ['P0'], '2026-11-10T00:00:00Z'),
        item(56, ['P0'], '2026-11-14T00:00:00Z'),
        item(7, [], '2026-11-15T06:00:00Z')
      ])
    ])
    expect(flattenAssignedIssues(state).map((issue) => issue.number)).toEqual([56, 10, 114, 7])
    expect(flattenAssignedIssues(state)[0].repoFullName).toBe('bminhnemhoi/docset-check')
  })

  it('keeps the last good issues when a repo fails, so a network blip does not clear them', () => {
    const first = mergeRepoOutcomes(EMPTY, [ok('r1', [item(10, ['P0'], '2026-11-10T00:00:00Z')])])
    const second = mergeRepoOutcomes(first, [{ repoId: 'r1', kind: 'failed', message: 'offline' }])
    expect(flattenAssignedIssues(second).map((issue) => issue.number)).toEqual([10])
    expect(second.error).toBe('offline')
  })

  it('wakes for PRs waiting on your review and lists a PR both assigned and requested once', () => {
    const state = mergeRepoOutcomes(EMPTY, [ok('momo', [pr(3)], [pr(3), pr(2)])])
    expect(
      flattenAssignedIssues(state).map((entry) => [entry.number, entry.kind, entry.repoFullName])
    ).toEqual([
      [3, 'review', 'Towfienes/Momo-Techday'],
      [2, 'review', 'Towfienes/Momo-Techday']
    ])
  })

  it('skips repos without a GitHub source on later polls', () => {
    const none = { items: [], sources: { issues: null, prs: null } }
    const state = mergeRepoOutcomes(EMPTY, [
      { repoId: 'local', kind: 'ok', assigned: none, review: none },
      ok('r1', [])
    ])
    expect(state.skipped).toEqual(['local'])
    expect(state.error).toBeNull()
  })

  it('empties a repo once its issues are all closed', () => {
    const first = mergeRepoOutcomes(EMPTY, [ok('r1', [item(10, ['P0'], '2026-11-10T00:00:00Z')])])
    expect(flattenAssignedIssues(mergeRepoOutcomes(first, [ok('r1', [])]))).toEqual([])
  })
})

describe('formatIssueAge', () => {
  const now = Date.parse('2026-11-15T12:00:00Z')
  it('prints short Vietnamese relative times', () => {
    expect(formatIssueAge('2026-11-15T11:59:40Z', now)).toBe('vừa xong')
    expect(formatIssueAge('2026-11-15T11:55:00Z', now)).toBe('5 phút trước')
    expect(formatIssueAge('2026-11-15T09:00:00Z', now)).toBe('3 giờ trước')
    expect(formatIssueAge('2026-11-13T12:00:00Z', now)).toBe('2 ngày trước')
  })
})
