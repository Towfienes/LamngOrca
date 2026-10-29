import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Plus, RefreshCw, X } from 'lucide-react'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '../ui/command'
import { Button } from '../ui/button'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { getDeckSessionAgents } from './deck-session-agent'
import { deckAgentHasAccountStep } from './deck-account-agent-launch'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { useAppStore } from '@/store'
import { getAiVaultResumeWorkspaceExecutionHostId } from '@/lib/ai-vault-resume-target'
import { resolveAiVaultTargetWorkspacePath } from '../right-sidebar/ai-vault-session-launch-target'
import { SessionTime } from '../right-sidebar/ai-vault-session-time'
import { filterAiVaultSessions } from '../../../../shared/ai-vault-session-filters'
import {
  isAiVaultScanCancelledError,
  isAiVaultSessionResumableContent,
  type AiVaultSession
} from '../../../../shared/ai-vault-types'
import { LOCAL_EXECUTION_HOST_ID } from '../../../../shared/execution-host'
import type { TuiAgent } from '../../../../shared/tui-agent'

export function DeckAgentSessionPicker({
  agent,
  worktreeId,
  accountLabel,
  loadSessions,
  onBack,
  onLaunch
}: {
  agent: TuiAgent
  worktreeId: string
  accountLabel: string
  /** Replaces the AI vault scan with another history source (claude9 keeps its own dir). */
  loadSessions?: () => Promise<AiVaultSession[]>
  onBack: () => void
  onLaunch: (session?: AiVaultSession) => Promise<void>
}): React.JSX.Element {
  const isOpenCode = agent === 'opencode' || agent === 'opencode2'
  const hasAccountStep = deckAgentHasAccountStep(agent)
  const pageSize = isOpenCode ? 20 : 40
  const [sessions, setSessions] = useState<AiVaultSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [all, setAll] = useState(false)
  const [shown, setShown] = useState(pageSize)
  const [limit, setLimit] = useState(isOpenCode ? 250 : 1000)
  const [hasMore, setHasMore] = useState(false)
  const [refresh, setRefresh] = useState(0)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const deferredQuery = useDeferredValue(query)
  const state = useAppStore.getState()
  const path = resolveAiVaultTargetWorkspacePath(state, worktreeId)
  const host =
    getAiVaultResumeWorkspaceExecutionHostId(state, worktreeId) ?? LOCAL_EXECUTION_HOST_ID
  const historyAgent = agent === 'claude-agent-teams' ? 'claude' : agent
  const supportedAgents = useMemo(() => getDeckSessionAgents(agent), [agent])
  useEffect(() => {
    searchRef.current?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    if (supportedAgents.length === 0) {
      setLoading(false)
      return
    }
    let alive = true
    const requestToken = createBrowserUuid()
    setLoading(true)
    setError(null)
    const listing = loadSessions
      ? loadSessions().then((list) => ({ cancelled: false, sessions: list, issues: [] }))
      : window.api.aiVault.listSessions({
          limit,
          scopePaths: path ? [path] : [],
          executionHostScope: host,
          requestToken,
          ...(refresh ? { force: true } : {})
        })
    void listing
      .then((result) => {
        if (!alive || result.cancelled) {
          return
        }
        const seen = new Set<string>()
        setHasMore(result.sessions.length >= limit)
        setSessions(
          result.sessions.filter((s) => {
            const identity = `${s.agent}:${s.sessionId}`
            if (s.executionHostId !== host || s.subagent || s.isSubagent || seen.has(identity)) {
              return false
            }
            seen.add(identity)
            return true
          })
        )
        const issue = result.issues.find((i) => supportedAgents.includes(i.agent))
        if (issue) {
          setError(`Some history could not be read: ${issue.message}`)
        }
      })
      .catch((error) => {
        if (alive && !isAiVaultScanCancelledError(error)) {
          setError(error instanceof Error ? error.message : 'Could not load session history.')
        }
      })
      .finally(() => {
        if (alive) {
          setLoading(false)
        }
      })
    return () => {
      alive = false
      void window.api.aiVault.cancelListSessions({ requestToken }).catch(() => {})
    }
  }, [host, path, historyAgent, supportedAgents, refresh, limit, loadSessions])
  const filtered = useMemo(
    () =>
      filterAiVaultSessions(
        sessions.filter((session) => session.executionHostId === host),
        {
          agents: supportedAgents,
          query: deferredQuery,
          scope: all ? 'all' : 'workspace',
          activeWorktreePaths: path ? [path] : [],
          sort: 'updated',
          hideEmptySessions: true
        }
      ),
    [sessions, deferredQuery, all, path, supportedAgents, host]
  )
  const launch = async (session?: AiVaultSession): Promise<void> => {
    if (busyRef.current) {
      return
    }
    busyRef.current = true
    setBusy(true)
    setError(null)
    try {
      await onLaunch(session)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Could not open this session.')
    } finally {
      busyRef.current = false
      setBusy(false)
    }
  }
  return (
    <div
      className="w-96 max-w-[calc(100vw-2rem)]"
      aria-label={`${getAgentLabel(agent)} session history`}
    >
      <div className="flex flex-col gap-3 p-3">
        <div className="flex items-center gap-2">
          <AgentIcon agent={agent} size={18} />
          <h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
            {getAgentLabel(agent)} sessions
          </h3>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={busy || loading}
            aria-label="Refresh sessions"
            onClick={() => {
              setShown(pageSize)
              setRefresh(refresh + 1)
            }}
          >
            <RefreshCw />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={busy}
            onClick={onBack}
            aria-label={hasAccountStep ? 'Back to accounts' : 'Close sessions'}
          >
            {hasAccountStep ? <ArrowLeft /> : <X />}
          </Button>
        </div>
        {hasAccountStep ? (
          <p className="truncate text-xs text-muted-foreground" title={accountLabel}>
            {accountLabel}
          </p>
        ) : null}
        {isOpenCode ? (
          <>
            <Button size="sm" disabled={busy} onClick={() => void launch()}>
              <Plus />
              New session
            </Button>
            <ToggleGroup
              type="single"
              size="xs"
              value={all ? 'all' : 'workspace'}
              onValueChange={(value) => {
                if (value) {
                  setAll(value === 'all')
                  setShown(pageSize)
                }
              }}
              aria-label="Session scope"
              className="w-full"
            >
              <ToggleGroupItem value="workspace" className="flex-1">
                This workspace
              </ToggleGroupItem>
              <ToggleGroupItem value="all" className="flex-1">
                All sessions
              </ToggleGroupItem>
            </ToggleGroup>
          </>
        ) : (
          <Button
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={() => {
              setAll(!all)
              setShown(pageSize)
            }}
          >
            {all ? 'This workspace' : 'View all sessions'}
          </Button>
        )}
      </div>
      <Command shouldFilter={false} label="Search sessions">
        <CommandInput
          ref={searchRef}
          value={query}
          onValueChange={(value) => {
            setQuery(value)
            setShown(pageSize)
          }}
          placeholder="Search sessions…"
          aria-label="Search sessions"
          disabled={busy}
        />
        <CommandList>
          {!isOpenCode && (
            <CommandItem value="new-session" disabled={busy} onSelect={() => void launch()}>
              <Plus />
              <span>New session</span>
            </CommandItem>
          )}
          {loading && sessions.length === 0 ? (
            <p role="status" className="p-3 text-xs text-muted-foreground">
              Loading session history…
            </p>
          ) : null}
          <CommandGroup>
            {filtered.slice(shown - pageSize, shown).map((session) => (
              <CommandItem
                key={session.id}
                value={session.id}
                disabled={
                  busy ||
                  (isOpenCode && query !== deferredQuery) ||
                  (!session.structuredSession && !isAiVaultSessionResumableContent(session))
                }
                onSelect={() => void launch(session)}
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate text-xs font-medium" title={session.title}>
                    {session.title || session.sessionId}
                  </p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {isOpenCode && `${getAgentLabel(session.agent)} · `}
                    {all
                      ? (session.cwd ?? 'Unknown workspace')
                      : (session.branch ?? session.model ?? session.sessionId)}
                  </p>
                </div>
                <SessionTime value={session.updatedAt ?? session.modifiedAt} />
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
      <div className="space-y-2 p-3">
        {!loading && !error && filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {supportedAgents.length
              ? query
                ? 'No matching sessions. Try another search or workspace scope.'
                : 'No sessions here. Start a new session or view all.'
              : 'This agent does not expose resumable history yet. You can start a new session.'}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Previous sessions"
            disabled={busy || shown <= pageSize}
            onClick={() => setShown(shown - pageSize)}
          >
            <ChevronLeft />
          </Button>
          <span className="text-xs text-muted-foreground" aria-live="polite">
            {filtered.length
              ? `${shown - pageSize + 1}–${Math.min(shown, filtered.length)} of ${filtered.length}`
              : '0 sessions'}
          </span>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Next sessions"
            disabled={busy || filtered.length <= shown}
            onClick={() => setShown(shown + pageSize)}
          >
            <ChevronRight />
          </Button>
        </div>
        {hasMore && limit < 2000 ? (
          <Button
            variant="ghost"
            size="xs"
            disabled={busy || loading}
            onClick={() => setLimit(Math.min(limit * 2, 2000))}
          >
            Load older sessions
          </Button>
        ) : null}
        {error ? (
          <p role="alert" className="text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {busy ? (
          <p role="status" className="text-xs text-muted-foreground">
            Opening session…
          </p>
        ) : null}
      </div>
    </div>
  )
}
