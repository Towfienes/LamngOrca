import { SquareTerminal } from 'lucide-react'
import { useAppStore } from '@/store'
import { AgentIcon } from '@/lib/agent-catalog'
import { agentTypeToIconAgent, formatAgentTypeLabel } from '@/lib/agent-status'

export function DeckPaneIdentity({
  paneKey,
  hasTitle
}: {
  paneKey: string
  hasTitle: boolean
}): React.JSX.Element {
  const agent = useAppStore((state) => state.agentStatusByPaneKey[paneKey])
  const agentType = agent?.agentType
  return (
    <span className="deck-pane-identity mr-2 inline-flex min-w-0 items-center gap-2 overflow-hidden">
      {agentType ? (
        <AgentIcon agent={agentTypeToIconAgent(agentType)} size={14} />
      ) : (
        <SquareTerminal className="size-3.5 shrink-0" />
      )}
      {!hasTitle ? (
        <span className="truncate">
          {agent?.lastAssistantMessage ||
            (agentType ? formatAgentTypeLabel(agentType) : 'Terminal')}
        </span>
      ) : null}
    </span>
  )
}
