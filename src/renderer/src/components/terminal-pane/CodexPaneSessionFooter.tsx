import { useEffect, useState } from 'react'
import type { Terminal } from '@xterm/xterm'
import { usePaneAccountIdentity } from './use-pane-account-identity'

type ContextTerminal = Pick<Terminal, 'buffer' | 'rows' | 'onWriteParsed'>

// shortcut: mirror captured footer text near the composer; capture new formats if CLI wording changes.
function readCodexContext(terminal: ContextTerminal): number | null {
  const buffer = terminal.buffer.active
  const end = Math.min(terminal.rows - 1, buffer.cursorY + 5)
  for (let row = end; row >= Math.max(0, buffer.cursorY - 2); row--) {
    const line = buffer.getLine(buffer.baseY + row)?.translateToString(true) ?? ''
    const used = /\bContext\s+(\d{1,3})%\s+used\b/i.exec(line)
    const left = /\b(\d{1,3})%\s+context left\b/i.exec(line)
    const value = Number(used?.[1] ?? left?.[1])
    if ((used || left) && value >= 0 && value <= 100) {
      return used ? value : 100 - value
    }
  }
  return null
}

export function CodexPaneSessionFooter({
  paneKey,
  ptyId,
  terminal
}: {
  paneKey: string
  ptyId: string
  terminal: ContextTerminal
}): React.JSX.Element | null {
  const identity = usePaneAccountIdentity(paneKey)
  const enabled = identity.agentType === 'codex' && identity.ptyId === ptyId
  const [percentage, setPercentage] = useState<number | null>(null)
  useEffect(() => {
    if (!enabled) {
      return
    }
    let frame = 0
    const update = (): void => {
      frame = 0
      setPercentage(readCodexContext(terminal))
    }
    update()
    const subscription = terminal.onWriteParsed(() => {
      if (!frame) {
        frame = requestAnimationFrame(update)
      }
    })
    return () => {
      subscription.dispose()
      cancelAnimationFrame(frame)
    }
  }, [enabled, ptyId, terminal])
  if (!enabled) {
    return null
  }
  const account = identity.accountLabel || 'account —'
  const context = percentage === null ? 'ctx —' : `ctx ${percentage}%`
  return (
    <div
      className="pane-session-footer flex items-center gap-2 border-t border-border px-3 text-xs text-muted-foreground"
      role="status"
      aria-live="off"
      aria-label="Codex session account and context"
      title={`${account} · ${context}`}
    >
      <span className="min-w-0 max-w-1/3 truncate">{account}</span>
      <span className="ml-auto shrink-0">{context}</span>
    </div>
  )
}
