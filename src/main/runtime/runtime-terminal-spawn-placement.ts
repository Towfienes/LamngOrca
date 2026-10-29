import type { TerminalPanePlacement } from '../../shared/terminal-pane-placement'
import type { TerminalPaneSplitDirection } from '../../shared/terminal-tab-types'
import type { RuntimeTerminalPresentation } from '../../shared/runtime-terminal-contracts'

/** Use requested/first group; revealed tabs honor user names, background worker tabs keep live titles. */
export function newTabIn(opts: {
  viewMode?: 'terminal' | 'chat'
  targetGroupId?: string
  title?: string
  presentation?: RuntimeTerminalPresentation
  agentJoin?: { leafId: string; direction: TerminalPaneSplitDirection }
}): {
  placement: TerminalPanePlacement
  groupId?: string
} {
  const { viewMode, targetGroupId } = opts
  if (opts.agentJoin) {
    // Deck: an agent joining the open workspace splits its pane instead of opening a tab.
    return { placement: runtimeSplitPlacement(opts.agentJoin.leafId, opts.agentJoin.direction) }
  }
  const title = opts.presentation === 'background' ? undefined : opts.title
  const row = {
    ...(viewMode ? { viewMode } : {}),
    ...(title ? { customTitle: title } : {})
  }
  return {
    placement: viewMode || title ? { kind: 'new-tab', row } : { kind: 'new-tab' },
    ...(targetGroupId ? { groupId: targetGroupId } : {})
  }
}

export function runtimeSplitPlacement(
  parentLeafId: string,
  direction: TerminalPaneSplitDirection
): TerminalPanePlacement {
  return { kind: 'split', parentLeafId, direction }
}
