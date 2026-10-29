import { useAppStore } from '@/store'
import { translate } from '@/i18n/i18n'
import { stripLeadingAgentTitleDecoration } from '../../../../shared/agent-title-decoration'
import { collectLeafIdsInOrder } from '../terminal-pane/terminal-layout-leaf-ids'

/** Deck names a multi-pane tab as a workspace; one agent's title would mislabel its siblings. */
export function useDeckTabDisplayTitle(
  tab: { id: string; title: string; customTitle?: string | null },
  hasAgentIcon: boolean
): string {
  const paneCount = useAppStore(
    (state) => collectLeafIdsInOrder(state.terminalLayoutsByTabId?.[tab.id]?.root).length
  )
  return (
    tab.customTitle ??
    (paneCount > 1
      ? translate('deck.tabs.workspacePanes', 'Workspace · {{count}} panes', { count: paneCount })
      : // With a provider icon shown, strip the agent's own glyph so one agent doesn't show two icons.
        hasAgentIcon
        ? stripLeadingAgentTitleDecoration(tab.title)
        : tab.title)
  )
}
