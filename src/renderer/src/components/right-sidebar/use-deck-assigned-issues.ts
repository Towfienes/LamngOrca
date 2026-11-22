import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAppStore } from '@/store'
import {
  ASSIGNED_ISSUES_QUERY,
  flattenAssignedIssues,
  mergeRepoOutcomes,
  type AssignedIssuesState,
  type DeckAssignedIssue,
  type RepoIssuesOutcome
} from './deck-assigned-issues-model'

// Read-only `gh` reads through the existing work-item IPC; no agent or model is involved.
const POLL_MS = 2 * 60_000
// Opening the balloon refreshes, but not more often than this.
const MIN_MANUAL_GAP_MS = 30_000

export type DeckAssignedIssues = {
  issues: DeckAssignedIssue[]
  /** True until the first poll settles. */
  loading: boolean
  refreshing: boolean
  error: string | null
  updatedAt: number | null
  refresh: (force?: boolean) => void
}

const EMPTY: AssignedIssuesState = { byRepo: {}, skipped: [], error: null }

export function useDeckAssignedIssues(): DeckAssignedIssues {
  const repos = useAppStore((state) => state.repos)
  const gitRepos = useMemo(
    () => repos.filter((repo) => repo.kind !== 'folder').map(({ id, path }) => ({ id, path })),
    [repos]
  )
  const [state, setState] = useState<AssignedIssuesState>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<number | null>(null)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])
  const inFlight = useRef(false)
  const lastRun = useRef(0)

  const poll = useCallback(async () => {
    if (inFlight.current) {
      return
    }
    inFlight.current = true
    setRefreshing(true)
    lastRun.current = Date.now()
    const skipped = new Set(stateRef.current.skipped)
    const targets = gitRepos.filter((repo) => !skipped.has(repo.id))
    const outcomes = await Promise.all(
      targets.map(async (repo): Promise<RepoIssuesOutcome> => {
        try {
          const result = await window.api.gh.listWorkItems({
            repoPath: repo.path,
            repoId: repo.id,
            query: ASSIGNED_ISSUES_QUERY,
            limit: 30
          })
          return { repoId: repo.id, kind: 'ok', result }
        } catch (error) {
          return {
            repoId: repo.id,
            kind: 'failed',
            message: error instanceof Error ? error.message : String(error)
          }
        }
      })
    )
    const known = new Set(gitRepos.map((repo) => repo.id))
    setState((previous) => {
      const merged = mergeRepoOutcomes(previous, outcomes)
      // Drop issues of repos removed from Orca since the last poll.
      const byRepo = Object.fromEntries(
        Object.entries(merged.byRepo).filter(([repoId]) => known.has(repoId))
      )
      return { ...merged, byRepo }
    })
    setUpdatedAt(Date.now())
    setLoading(false)
    setRefreshing(false)
    inFlight.current = false
  }, [gitRepos])

  useEffect(() => {
    void poll()
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void poll()
      }
    }, POLL_MS)
    const onVisible = (): void => {
      if (document.visibilityState === 'visible' && Date.now() - lastRun.current >= POLL_MS) {
        void poll()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [poll])

  const refresh = useCallback(
    (force = false) => {
      if (force || Date.now() - lastRun.current >= MIN_MANUAL_GAP_MS) {
        void poll()
      }
    },
    [poll]
  )

  const issues = useMemo(() => flattenAssignedIssues(state), [state])
  return { issues, loading, refreshing, error: state.error, updatedAt, refresh }
}
