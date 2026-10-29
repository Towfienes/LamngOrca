import { usePaneAccountIdentity } from './use-pane-account-identity'
import { usePaneSessionTitle } from './use-pane-session-title'
import { SquareTerminal } from 'lucide-react'
import { AgentIcon } from '@/lib/agent-catalog'
import { agentTypeToIconAgent, formatAgentTypeLabel } from '@/lib/agent-status'
import { translate } from '@/i18n/i18n'

export function DeckPaneIdentity({
  paneKey,
  title,
  onEditTitle
}: {
  paneKey: string
  title?: string
  onEditTitle?: () => void
}): React.JSX.Element {
  const {
    agent,
    launch,
    foreground,
    matchingRecovery,
    accountLabel,
    agentType,
    savedPaneTitle,
    worktreeId
  } = usePaneAccountIdentity(paneKey)
  const label = accountLabel
    ? `${formatAgentTypeLabel(agentType ?? 'unknown')} · ${accountLabel}`
    : agentType
      ? formatAgentTypeLabel(agentType)
      : 'Terminal'
  // Why: the same name the sidebar row shows; raw prompts and output are never a title.
  const sessionTitle = usePaneSessionTitle(
    paneKey,
    agentType,
    (
      agent?.providerSession ??
      matchingRecovery?.providerSession ??
      launch?.identity.providerSession
    )?.id,
    agent?.worktreeId ?? matchingRecovery?.worktreeId ?? worktreeId ?? undefined,
    title || savedPaneTitle,
    matchingRecovery?.terminalTitle
  )
  const model = (
    foreground?.shellForeground ? undefined : (agent?.model ?? matchingRecovery?.model)
  )?.trim()
  const reasoningEffort = (
    foreground?.shellForeground
      ? undefined
      : (agent?.reasoningEffort ??
        (!agent?.model || agent.model === matchingRecovery?.model
          ? matchingRecovery?.reasoningEffort
          : undefined))
  )?.trim()
  const identityLabel = [label, model, reasoningEffort].filter(Boolean).join(' · ')
  const hoverLabel = sessionTitle ? `${identityLabel}\n${sessionTitle}` : identityLabel
  return (
    <span
      className="deck-pane-identity mr-2 inline-flex min-w-0 flex-1 items-center gap-2 overflow-hidden whitespace-nowrap"
      title={hoverLabel}
    >
      {agentType ? (
        <AgentIcon agent={agentTypeToIconAgent(agentType)} size={14} />
      ) : (
        <SquareTerminal className="size-3.5 shrink-0" />
      )}
      <span className="flex min-w-0 flex-1 items-center justify-start gap-2 overflow-hidden">
        {sessionTitle ? (
          <button
            type="button"
            className="pane-title-text min-w-0 flex-1 truncate text-left"
            style={{ lineHeight: 1 }}
            title={sessionTitle}
            onClick={onEditTitle}
            aria-label={translate(
              'auto.components.terminal.pane.TerminalPane.cc5a2dc706',
              'Edit pane title: {{value0}}',
              { value0: sessionTitle }
            )}
          >
            {sessionTitle}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate leading-none" title={label}>
            {/* Why: the same neutral name the sidebar row falls back to. */}
            {agentType
              ? formatAgentTypeLabel(agentType)
              : translate('auto.components.sidebar.worktree.name.Session', 'Session')}
          </span>
        )}
      </span>
    </span>
  )
}
