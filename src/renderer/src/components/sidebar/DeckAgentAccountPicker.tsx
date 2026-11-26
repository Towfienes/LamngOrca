import { useEffect, useRef, useState } from 'react'
import { Check, Loader2, Plus, RefreshCw, Settings, X } from 'lucide-react'
import { useAppStore } from '@/store'
import { AgentIcon, getAgentLabel } from '@/lib/agent-catalog'
import { getCodexAccountDisplayLabel } from '@/lib/codex-account-display-label'
import { getUsageRosterRowState } from '../status-bar/usage-roster-row-state'
import { getTightestUsageSection } from '../status-bar/UsageRosterPanel'
import { Button } from '../ui/button'
import { CodexLoginLinkNotice } from '../settings/accounts/codex/CodexLoginLinkNotice'
import { useClaude9Models } from './DeckClaude9Section'
import { useDeeprelayModels } from './DeckDeeprelaySection'
import {
  DeckAccountRouterSections,
  type DeckAccountRouterPreview
} from './DeckAccountRouterSections'
import { DeckAccountPreviewAside } from './DeckAccountPreviewAside'
import type { DeckAccountAgent } from './deck-account-agent-launch'
import { useDeckAntigravityAccounts } from './use-deck-antigravity-accounts'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'

export function accountNeedsSignIn(usage: ProviderRateLimits | null): boolean {
  return Boolean(
    usage &&
    (getUsageRosterRowState(usage, false).kind === 'sign-in' ||
      usage.usageMetadata?.failureKind === 'stale-token')
  )
}

export function DeckAgentAccountPicker({
  agent,
  local,
  onLaunch,
  onLaunchClaude9,
  onLaunchDeeprelay,
  onClose
}: {
  agent: DeckAccountAgent
  local: boolean
  onLaunch: (accountId?: string, login?: boolean) => void
  /** Present only where a claude9 (9router) launch is wired; adds the 9router row. */
  onLaunchClaude9?: () => void
  /** Present only where a DeepRelay (claude-dl) launch is wired; adds its row. */
  onLaunchDeeprelay?: () => void
  onClose: () => void
}): React.JSX.Element {
  const settings = useAppStore((s) => s.settings)
  const limits = useAppStore((s) => s.rateLimits)
  // Why: hover only previews usage; the sign-in target changes on click or keyboard, so moving
  // the pointer to the button can never retarget it to the last row crossed.
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [targetId, setTargetId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const busyRef = useRef(false)
  const showClaude9 = local && agent === 'claude' && Boolean(onLaunchClaude9)
  const claude9 = useClaude9Models(showClaude9)
  const showDeeprelay = local && agent === 'claude' && Boolean(onLaunchDeeprelay)
  const deeprelay = useDeeprelayModels(showDeeprelay)
  const [altPreview, setAltPreview] = useState<DeckAccountRouterPreview>(null)
  const agy = useDeckAntigravityAccounts(local && agent === 'antigravity')
  const activeId =
    agent === 'antigravity'
      ? (agy.state?.activeAccountId ?? null)
      : agent === 'claude'
        ? (settings?.activeClaudeManagedAccountIdsByRuntime?.host ??
          settings?.activeClaudeManagedAccountId)
        : agent === 'codex'
          ? (settings?.activeCodexManagedAccountIdsByRuntime?.host ??
            settings?.activeCodexManagedAccountId)
          : null
  const accounts = !local
    ? []
    : agent === 'antigravity'
      ? (agy.state?.accounts ?? []).map((a) => ({
          id: a.id,
          label: a.email ?? 'Saved Google account',
          detail: null
        }))
      : agent === 'claude'
        ? (settings?.claudeManagedAccounts ?? [])
            .filter((a) => a.managedAuthRuntime !== 'wsl')
            .map((a) => ({ id: a.id, label: a.email, detail: a.organizationName }))
        : (settings?.codexManagedAccounts ?? [])
            .filter((a) => a.managedHomeRuntime !== 'wsl')
            .map((a) => ({
              id: a.id,
              label: getCodexAccountDisplayLabel(a, settings?.codexManagedAccounts ?? []),
              detail: a.workspaceLabel
            }))
  const usageForAccount = (id: string | null): ProviderRateLimits | null => {
    if (id === null || id === (activeId ?? null)) {
      if (agent === 'antigravity') {
        return limits.antigravity
      }
      return limits[agent]
    }
    if (agent === 'antigravity') {
      return agy.usage[id] ?? null
    }
    const roster = agent === 'claude' ? limits.inactiveClaudeAccounts : limits.inactiveCodexAccounts
    return roster.find((a) => a.accountId === id)?.rateLimits ?? null
  }
  const fetchingForAccount = (id: string | null): boolean => {
    if (id === null || id === (activeId ?? null)) {
      return false
    }
    if (agent === 'antigravity') {
      return agy.fetching
    }
    const roster = agent === 'claude' ? limits.inactiveClaudeAccounts : limits.inactiveCodexAccounts
    return roster.find((a) => a.accountId === id)?.isFetching === true
  }
  const selectedUsage = usageForAccount(selectedId)
  const signedOut = accountNeedsSignIn(usageForAccount(targetId))

  useEffect(() => {
    const state = useAppStore.getState()
    setSelectedId(activeId ?? null)
    setTargetId(activeId ?? null)
    if (local && agent === 'claude') {
      void state.fetchInactiveClaudeAccountUsage().catch(() => {})
    }
    if (local && agent === 'codex') {
      void state.fetchInactiveCodexAccountUsage().catch(() => {})
    }
  }, [agent, local, activeId])

  const openAccounts = (): void => {
    onClose()
    const state = useAppStore.getState()
    state.openSettingsTarget({
      pane: 'accounts',
      repoId: null,
      sectionId: `accounts-${agent}`
    })
    state.openSettingsPage()
  }
  const reauthenticate = async (accountId: string | null): Promise<void> => {
    if (!accountId || agent === 'antigravity' || busyRef.current) {
      return
    }
    busyRef.current = true
    setTargetId(accountId)
    setBusy(true)
    setSigningIn(true)
    setError(null)
    try {
      await (agent === 'claude'
        ? window.api.claudeAccounts.reauthenticate({ accountId })
        : window.api.codexAccounts.reauthenticate({
            accountId,
            activateIfSelectionWasEmpty: false
          }))
      const state = useAppStore.getState()
      await state.fetchSettings()
      // Why: main reset the open-debounce for this account, so this re-probes it right away.
      void (
        agent === 'claude'
          ? state.fetchInactiveClaudeAccountUsage()
          : state.fetchInactiveCodexAccountUsage()
      ).catch(() => {})
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in. Try again.')
    } finally {
      busyRef.current = false
      setBusy(false)
      setSigningIn(false)
    }
  }
  const cancelSignIn = (): void => {
    void (
      agent === 'claude'
        ? window.api.claudeAccounts.cancelPendingLogin()
        : window.api.codexAccounts.cancelPendingLogin()
    ).catch(() => {})
  }
  const previewAccount = (id: string | null): void => {
    if (!busyRef.current) {
      setSelectedId(id)
      setAltPreview(null)
      setError(null)
    }
  }
  const launchAlt = (launch?: () => void): void => {
    if (!launch || busyRef.current) {
      return
    }
    busyRef.current = true
    setBusy(true)
    launch()
  }
  const launchAccount = (id: string | null): void => {
    if (busyRef.current) {
      return
    }
    previewAccount(id)
    setTargetId(id)
    if (agent === 'antigravity') {
      // Why: agy reads one native credential, so the saved account becomes native before launch.
      busyRef.current = true
      setBusy(true)
      void (async () => {
        if (id === null || id === activeId || (await agy.select(id))) {
          onLaunch(undefined)
          return
        }
        busyRef.current = false
        setBusy(false)
      })()
      return
    }
    // Why: choosing a signed-out account means renewing exactly that account.
    if (accountNeedsSignIn(usageForAccount(id))) {
      void reauthenticate(id)
      return
    }
    busyRef.current = true
    setBusy(true)
    onLaunch(id ?? undefined)
  }
  const addAntigravityAccount = (): void => {
    if (busyRef.current) {
      return
    }
    busyRef.current = true
    setBusy(true)
    void (async () => {
      // Why: agy has no login command; once signed out, its next start opens Google sign-in.
      if (await agy.prepareNewAccount()) {
        onLaunch(undefined)
        return
      }
      busyRef.current = false
      setBusy(false)
    })()
  }
  const previewLabel =
    accounts.find((a) => a.id === selectedId)?.label ??
    (agent === 'antigravity' ? 'Current agy account' : 'Orca default')
  const targetLabel = accounts.find((a) => a.id === targetId)?.label
  return (
    <div className="flex max-w-[calc(100vw-2rem)]" aria-label={`${getAgentLabel(agent)} accounts`}>
      <div className="w-80 shrink-0 space-y-3 p-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <AgentIcon agent={agent} size={18} />
            {getAgentLabel(agent)}
          </h3>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Manage accounts"
            onClick={openAccounts}
          >
            <Settings />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {local
            ? 'Hover for usage. Choose an account to continue.'
            : 'Accounts are managed on the workspace host.'}
        </p>
        <div
          className="max-h-56 space-y-1 overflow-y-auto scrollbar-sleek"
          role="group"
          aria-label="Launch account"
        >
          {[
            // Why: a signed-in agy account is saved automatically, so its row replaces this one.
            ...(agent === 'antigravity' &&
            local &&
            agy.state &&
            (activeId || !agy.state.currentAccount)
              ? []
              : [
                  {
                    id: null,
                    label: !local
                      ? 'Workspace host account'
                      : agent === 'antigravity'
                        ? 'Current agy account'
                        : 'Orca default',
                    detail: null
                  }
                ]),
            ...accounts
          ].map((account) => {
            const selected = selectedId === account.id
            const usage = usageForAccount(account.id)
            const tightest = usage ? getTightestUsageSection(usage) : null
            const fetching = fetchingForAccount(account.id)
            return (
              <button
                key={account.id ?? 'default'}
                type="button"
                aria-label={account.label}
                disabled={busy}
                data-current={selected}
                className="group/deck-account flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left outline-none transition-colors duration-150 hover:bg-accent/50 motion-reduce:transition-none"
                onPointerEnter={() => previewAccount(account.id)}
                onFocus={() => previewAccount(account.id)}
                onClick={() => launchAccount(account.id)}
              >
                <span className="flex size-4 shrink-0 items-center justify-center">
                  {selected ? <Check className="size-3.5" /> : null}
                </span>
                <span className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-xs group-focus-visible/deck-account:underline group-focus-visible/deck-account:underline-offset-4">
                    {account.label}
                  </span>
                  {account.detail ? (
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {account.detail}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground">
                  {/* Why: keep the last known figure while refreshing instead of a blank dash. */}
                  {fetching ? (
                    <Loader2 className="size-3 animate-spin" aria-label="Loading usage" />
                  ) : null}
                  {accountNeedsSignIn(usage)
                    ? 'Sign in again'
                    : tightest
                      ? `${Math.round(100 - tightest.window.usedPercent)}% left`
                      : fetching
                        ? 'Loading'
                        : '—'}
                </span>
              </button>
            )
          })}
        </div>
        <DeckAccountRouterSections
          claude9={claude9.list}
          deeprelay={deeprelay.list}
          altPreview={altPreview}
          disabled={busy}
          onPreview={(target) => !busyRef.current && setAltPreview(target)}
          onLaunchClaude9={showClaude9 ? () => launchAlt(onLaunchClaude9) : undefined}
          onLaunchDeeprelay={showDeeprelay ? () => launchAlt(onLaunchDeeprelay) : undefined}
          onRetryClaude9={claude9.refresh}
          onRetryDeeprelay={deeprelay.refresh}
        />
        {local && agent === 'antigravity' && accounts.length === 0 && agy.state ? (
          <p className="text-xs text-muted-foreground">
            Sign in with agy; the account is saved here automatically.
          </p>
        ) : local && agent !== 'antigravity' && accounts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No saved accounts yet.</p>
        ) : null}
        {error || agy.error ? (
          <p role="alert" className="text-xs text-destructive">
            {error ?? agy.error}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
          <Button
            variant="ghost"
            size="xs"
            disabled={busy}
            onClick={agent === 'antigravity' && local ? addAntigravityAccount : openAccounts}
          >
            <Plus />
            Add account
          </Button>
          {signingIn ? (
            <Button variant="ghost" size="xs" onClick={cancelSignIn}>
              <X />
              Cancel
            </Button>
          ) : targetId && agent !== 'antigravity' ? (
            <Button
              variant={signedOut ? 'default' : 'link'}
              size="xs"
              disabled={busy}
              title={targetLabel}
              onClick={() => void reauthenticate(targetId)}
            >
              <RefreshCw />
              Sign in again
            </Button>
          ) : null}
        </div>
        {signingIn ? (
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground" role="status">
            <Loader2 className="size-3 animate-spin" />
            <span className="min-w-0 truncate">Signing in {targetLabel} in your browser…</span>
          </p>
        ) : null}
        {signingIn && agent === 'codex' ? <CodexLoginLinkNotice /> : null}
      </div>
      {local ? (
        <DeckAccountPreviewAside
          altPreview={altPreview}
          claude9={claude9.list}
          deeprelay={deeprelay.list}
          previewLabel={previewLabel}
          selectedUsage={selectedUsage}
        />
      ) : null}
    </div>
  )
}
