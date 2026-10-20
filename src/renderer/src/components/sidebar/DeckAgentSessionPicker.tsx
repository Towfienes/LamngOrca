import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Plus, RefreshCw } from 'lucide-react'
import { Command, CommandInput, CommandItem, CommandList } from '../ui/command'
import { Button } from '../ui/button'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { createBrowserUuid } from '@/lib/browser-uuid'
import { useAppStore } from '@/store'
import { getAiVaultResumeWorkspaceExecutionHostId } from '@/lib/ai-vault-resume-target'
import { resolveAiVaultTargetWorkspacePath } from '../right-sidebar/ai-vault-session-launch-target'
import { SessionTime } from '../right-sidebar/ai-vault-session-time'
import { filterAiVaultSessions } from '../../../../shared/ai-vault-session-filters'
import {
  AI_VAULT_AGENTS,
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
  onBack,
  onLaunch
}: {
  agent: TuiAgent
  worktreeId: string
  accountLabel: string
  onBack: () => void
  onLaunch: (session?: AiVaultSession) => Promise<void>
}): React.JSX.Element {
  const [sessions, setSessions] = useState<AiVaultSession[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [all, setAll] = useState(false)
  const [shown, setShown] = useState(40)
  const [limit, setLimit] = useState(1000)
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
  const supportedAgents = useMemo(
    () => AI_VAULT_AGENTS.filter((id) => id === historyAgent),
    [historyAgent]
  )
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
    void window.api.aiVault
      .listSessions({
        limit,
        scopePaths: path ? [path] : [],
        executionHostScope: host,
        requestToken,
        ...(refresh ? { force: true } : {})
      })
      .then((result) => {
        if (!alive || result.cancelled) {
          return
        }
        const seen = new Set<string>()
        setSessions(
          result.sessions.filter((s) => {
            const identity = `${s.agent}:${s.sessionId}`
            if (s.executionHostId !== host || s.subagent || seen.has(identity)) {
              return false
            }
            seen.add(identity)
            return true
          })
        )
        const issue = result.issues.find((i) => i.agent === historyAgent)
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
  }, [host, path, historyAgent, supportedAgents, refresh, limit])
  const filtered = useMemo(
    () =>
      filterAiVaultSessions(sessions, {
        agents: supportedAgents,
        query: deferredQuery,
        scope: all ? 'all' : 'workspace',
        activeWorktreePaths: path ? [path] : [],
        sort: 'updated',
        hideEmptySessions: true
      }),
    [sessions, deferredQuery, all, path, supportedAgents]
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
      <div className="space-y-2 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <AgentIcon agent={agent} size={18} />
            {getAgentLabel(agent)} sessions
          </h3>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={busy}
            onClick={onBack}
            aria-label="Back to accounts"
          >
            <ArrowLeft />
          </Button>
        </div>
        <p className="truncate text-xs text-muted-foreground" title={accountLabel}>
          {accountLabel}
        </p>
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={() => {
              setAll(!all)
              setShown(40)
            }}
          >
            {all ? 'This workspace' : 'View all sessions'}
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            disabled={busy || loading}
            aria-label="Refresh sessions"
            onClick={() => setRefresh(refresh + 1)}
          >
            <RefreshCw />
          </Button>
        </div>
      </div>
      <Command shouldFilter={false}>
        <CommandInput
          ref={searchRef}
          value={query}
          onValueChange={(value) => {
            setQuery(value)
            setShown(40)
          }}
          placeholder="Search sessions…"
          aria-label="Search sessions"
          disabled={busy}
        />
        <CommandList>
          <CommandItem value="new-session" disabled={busy} onSelect={() => void launch()}>
            <Plus />
            <span>New session</span>
          </CommandItem>
          {loading && sessions.length === 0 ? (
            <p role="status" className="p-3 text-xs text-muted-foreground">
              Loading session history…
            </p>
          ) : null}
          {filtered.slice(shown - 40, shown).map((session) => (
            <CommandItem
              key={session.id}
              value={session.id}
              disabled={
                busy || (!session.structuredSession && !isAiVaultSessionResumableContent(session))
              }
              onSelect={() => void launch(session)}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <p className="truncate text-xs font-medium" title={session.title}>
                  {session.title || session.sessionId}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">
                  {all
                    ? (session.cwd ?? 'Unknown workspace')
                    : (session.branch ?? session.model ?? session.sessionId)}
                </p>
              </div>
              <SessionTime value={session.updatedAt ?? session.modifiedAt} />
            </CommandItem>
          ))}
        </CommandList>
      </Command>
      <div className="space-y-2 p-3">
        {!loading && filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            {supportedAgents.length
              ? 'No sessions here. Start a new session or view all.'
              : 'This agent does not expose resumable history yet. You can start a new session.'}
          </p>
        ) : null}
        {shown > 40 ? (
          <Button variant="ghost" size="xs" disabled={busy} onClick={() => setShown(shown - 40)}>
            Previous sessions
          </Button>
        ) : null}
        {filtered.length > shown ? (
          <Button variant="ghost" size="xs" disabled={busy} onClick={() => setShown(shown + 40)}>
            Next sessions
          </Button>
        ) : null}
        {sessions.length >= limit && limit < 2000 ? (
          <Button
            variant="ghost"
            size="xs"
            disabled={busy || loading}
            onClick={() => setLimit(2000)}
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
