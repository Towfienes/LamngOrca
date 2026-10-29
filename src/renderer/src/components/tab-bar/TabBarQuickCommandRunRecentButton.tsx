import { Play } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { getAgentLabel } from '@/lib/agent-catalog'
import type { HostedTerminalQuickCommand } from '@/hooks/use-terminal-quick-command-hosts'
import {
  getTerminalQuickCommandBody,
  isTerminalAgentQuickCommand
} from '../../../../shared/terminal-quick-commands'

/** Left half of the quick-command split button: reruns the most recent command. */
export function TabBarQuickCommandRunRecentButton({
  mostRecent,
  className,
  onRun
}: {
  mostRecent: HostedTerminalQuickCommand | null
  className: string
  onRun: (command: HostedTerminalQuickCommand) => void
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={() => mostRecent && onRun(mostRecent)}
          disabled={!mostRecent}
          className={className}
          aria-label={
            mostRecent
              ? translate(
                  'auto.components.tab.bar.TabBarQuickCommandsButton.b775303755',
                  'Run quick command: {{value0}}',
                  { value0: mostRecent.command.label }
                )
              : translate(
                  'auto.components.tab.bar.TabBarQuickCommandsButton.85482c57bc',
                  'Run quick command'
                )
          }
        >
          <Play className="size-3 shrink-0" fill="currentColor" strokeWidth={0} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={6}>
        {mostRecent
          ? isTerminalAgentQuickCommand(mostRecent.command)
            ? translate(
                'auto.components.tab.bar.TabBarQuickCommandsButton.77ac113df0',
                'Start {{value0}}: {{value1}}',
                {
                  value0: getAgentLabel(mostRecent.command.agent),
                  value1: getTerminalQuickCommandBody(mostRecent.command)
                }
              )
            : translate(
                'auto.components.tab.bar.TabBarQuickCommandsButton.37e1bb90ce',
                'Run: {{value0}}',
                { value0: getTerminalQuickCommandBody(mostRecent.command) }
              )
          : translate(
              'auto.components.tab.bar.TabBarQuickCommandsButton.85482c57bc',
              'Run quick command'
            )}
      </TooltipContent>
    </Tooltip>
  )
}
