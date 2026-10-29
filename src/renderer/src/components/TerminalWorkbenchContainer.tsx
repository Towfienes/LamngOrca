import type { ReactNode } from 'react'
import { useAnyBrowserGuestNeedsPaint } from './browser-pane/host-guest/browser-guest-paint-retention'

// Why: the outermost ancestor of every browser <webview>. Parking it with `hidden` whenever
// the user leaves the workspace view also stops the guest compositing, which silently kills
// screencast frames for a phone or an agent driving that page.
//
// Why no entry animation: an opacity fade on this surface re-composites every xterm canvas
// underneath it, which showed up as a hitch exactly when a new CLI started painting. The
// pane's own reveal is enough; the grid must never move or fade (see
// tests/e2e/deck-terminal-startup-stability.spec.ts).
export function TerminalWorkbenchContainer({
  isVisible,
  children
}: {
  isVisible: boolean
  children: ReactNode
}): React.JSX.Element {
  const retainBrowserGuestPaint = useAnyBrowserGuestNeedsPaint(!isVisible)
  return (
    <div
      className={
        isVisible
          ? 'flex flex-1 min-w-0 min-h-0'
          : retainBrowserGuestPaint
            ? // Why: absolute keeps the invisible workbench out of the flex column so the
              // active page (Settings, Tasks, …) still gets the full content area.
              'absolute inset-0 flex opacity-0 pointer-events-none'
            : 'hidden flex-1 min-w-0 min-h-0'
      }
      // Why: a paintable-but-hidden workbench must stay unreachable by Tab / assistive tech.
      inert={!isVisible}
      aria-hidden={!isVisible}
      data-terminal-workbench-container=""
    >
      {children}
    </div>
  )
}
