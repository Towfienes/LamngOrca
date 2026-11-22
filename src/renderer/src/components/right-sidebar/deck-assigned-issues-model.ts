import type { GitHubWorkItem, ListWorkItemsResult } from '../../../../shared/github/work-item-types'

/** Open issues assigned to the signed-in `gh` user; the same search syntax the task list accepts. */
export const ASSIGNED_ISSUES_QUERY = 'is:issue is:open assignee:@me'

export type DeckAssignedIssue = {
  key: string
  repoId: string
  /** `owner/name` from the issue URL; the Orca display name can differ from the GitHub repo. */
  repoFullName: string
  number: number
  title: string
  url: string
  updatedAt: string
  /** 0 for P0 … ; null when the issue carries no priority label. */
  priority: number | null
}

export type RepoIssuesOutcome =
  | { repoId: string; kind: 'ok'; result: ListWorkItemsResult<Omit<GitHubWorkItem, 'repoId'>> }
  | { repoId: string; kind: 'failed'; message: string }

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
  const match = /github\.com\/([^/]+\/[^/]+)\/issues\//i.exec(url)
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
    const { result } = outcome
    if (!result.sources.issues || result.sources.ineligible) {
      skipped.add(outcome.repoId)
      delete byRepo[outcome.repoId]
      continue
    }
    if (result.errors?.issues) {
      failures.push(result.errors.issues.message)
      continue
    }
    byRepo[outcome.repoId] = result.items
      .filter((item) => item.type === 'issue' && item.state === 'open')
      .map((item) => ({
        key: `${outcome.repoId}#${item.number}`,
        repoId: outcome.repoId,
        repoFullName:
          repoFullNameFromIssueUrl(item.url) ||
          `${result.sources.issues!.owner}/${result.sources.issues!.repo}`,
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
