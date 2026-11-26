import type { GitHubWorkItem, ListWorkItemsResult } from '../../../../shared/github/work-item-types'

/** Open issues and PRs assigned to the signed-in `gh` user; the same search syntax the task list accepts. */
export const ASSIGNED_QUERY = 'is:open assignee:@me'
/** Open PRs that ask the signed-in `gh` user for a review. */
export const REVIEW_QUERY = 'is:pr is:open review-requested:@me'

/** `review` wins over `pr` when a PR is both assigned to you and waiting for your review. */
export type DeckWorkKind = 'issue' | 'pr' | 'review'

export type DeckAssignedIssue = {
  key: string
  repoId: string
  kind: DeckWorkKind
  /** `owner/name` from the item URL; the Orca display name can differ from the GitHub repo. */
  repoFullName: string
  number: number
  title: string
  url: string
  updatedAt: string
  /** 0 for P0 … ; null when the issue carries no priority label. */
  priority: number | null
}

type RepoWorkItems = ListWorkItemsResult<Omit<GitHubWorkItem, 'repoId'>>

export type RepoIssuesOutcome =
  | { repoId: string; kind: 'ok'; assigned: RepoWorkItems; review: RepoWorkItems }
  | { repoId: string; kind: 'failed'; message: string }

const OPEN_STATES = new Set<GitHubWorkItem['state']>(['open', 'draft'])

const PRIORITY_LABEL = /^(?:priority[\s:/-]*)?p([0-9])$/i

export function issuePriority(labels: readonly string[]): number | null {
  let best: number | null = null
  for (const label of labels) {
    const match = PRIORITY_LABEL.exec(label.trim())
    if (match) {
      const value = Number(match[1])
      best = best === null ? value : Math.min(best, value)
    }
  }
  return best
}

export function repoFullNameFromIssueUrl(url: string): string {
  const match = /github\.com\/([^/]+\/[^/]+)\/(?:issues|pull)\//i.exec(url)
  return match ? match[1] : ''
}

/** P0 first, unlabelled last; within a priority the most recently touched issue leads. */
export function sortAssignedIssues(issues: DeckAssignedIssue[]): DeckAssignedIssue[] {
  return [...issues].sort((a, b) => {
    const pa = a.priority ?? Number.POSITIVE_INFINITY
    const pb = b.priority ?? Number.POSITIVE_INFINITY
    if (pa !== pb) {
      return pa - pb
    }
    return Date.parse(b.updatedAt) - Date.parse(a.updatedAt)
  })
}

export type AssignedIssuesState = {
  /** Last good issues per repo; a failed fetch keeps them so a network blip never sleeps Boruto. */
  byRepo: Record<string, DeckAssignedIssue[]>
  /** Repos with no GitHub issue source; skipped on later polls. */
  skipped: string[]
  /** Set only when every polled repo failed. */
  error: string | null
}

export function mergeRepoOutcomes(
  previous: AssignedIssuesState,
  outcomes: RepoIssuesOutcome[]
): AssignedIssuesState {
  const byRepo = { ...previous.byRepo }
  const skipped = new Set(previous.skipped)
  const failures: string[] = []
  for (const outcome of outcomes) {
    if (outcome.kind === 'failed') {
      failures.push(outcome.message)
      continue
    }
    const { assigned, review } = outcome
    const { sources } = assigned
    if (sources.ineligible || (!sources.issues && !sources.prs)) {
      skipped.add(outcome.repoId)
      delete byRepo[outcome.repoId]
      continue
    }
    const fetchError = assigned.errors?.issues ?? assigned.errors?.prs ?? review.errors?.prs
    if (fetchError) {
      failures.push(fetchError.message)
      continue
    }
    const fallback = sources.issues ?? sources.prs!
    const reviewUrls = new Set(review.items.map((item) => item.url))
    // Why: issues and PRs can come from different repos (origin vs upstream), so the URL is the identity.
    const byUrl = new Map<string, RepoWorkItems['items'][number]>()
    for (const item of [...assigned.items, ...review.items]) {
      if (OPEN_STATES.has(item.state) && !byUrl.has(item.url)) {
        byUrl.set(item.url, item)
      }
    }
    byRepo[outcome.repoId] = [...byUrl.values()].map((item) => ({
      key: `${outcome.repoId}:${item.url}`,
      repoId: outcome.repoId,
      kind: item.type === 'issue' ? 'issue' : reviewUrls.has(item.url) ? 'review' : 'pr',
      repoFullName: repoFullNameFromIssueUrl(item.url) || `${fallback.owner}/${fallback.repo}`,
      number: item.number,
      title: item.title,
      url: item.url,
      updatedAt: item.updatedAt,
      priority: issuePriority(item.labels)
    }))
  }
  const allFailed = outcomes.length > 0 && failures.length === outcomes.length
  return { byRepo, skipped: [...skipped], error: allFailed ? failures[0] : null }
}

export function flattenAssignedIssues(state: AssignedIssuesState): DeckAssignedIssue[] {
  return sortAssignedIssues(Object.values(state.byRepo).flat())
}

export type DeckRepoGroup = { repoFullName: string; items: DeckAssignedIssue[] }

/** Groups sorted items by GitHub repo; the repo holding the most urgent item leads. */
export function groupByRepo(sorted: DeckAssignedIssue[]): DeckRepoGroup[] {
  const groups = new Map<string, DeckAssignedIssue[]>()
  for (const item of sorted) {
    const items = groups.get(item.repoFullName)
    if (items) {
      items.push(item)
    } else {
      groups.set(item.repoFullName, [item])
    }
  }
  return [...groups].map(([repoFullName, items]) => ({ repoFullName, items }))
}

export function formatIssueAge(updatedAt: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - Date.parse(updatedAt)) / 60_000))
  if (!Number.isFinite(minutes)) {
    return ''
  }
  if (minutes < 1) {
    return 'vừa xong'
  }
  if (minutes < 60) {
    return `${minutes} phút trước`
  }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} giờ trước`
  }
  return `${Math.floor(hours / 24)} ngày trước`
}
