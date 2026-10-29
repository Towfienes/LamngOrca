import { stripLeadingAgentTitleDecorationOrEmpty } from './agent-title-decoration'
import { formatAgentTypeLabel } from './agent-type-label'

/** DSH Chat useTerminalTitle uses prefix/whale/session. Whale identity must outrank Gemini’s working ✦ because DSH uses it for idle. Capture: src/main/runtime/__fixtures__/dsh-tui-ready-no-key.txt. */
export const DSH_WHALE = '\u{1F40B}' // 🐋

export function isDshTerminalTitle(title: string): boolean {
  return title.includes(DSH_WHALE)
}

export function getDshTerminalSessionTitle(title: string): string | null {
  const undecorated = stripLeadingAgentTitleDecorationOrEmpty(title.trim())
  if (!undecorated.startsWith(DSH_WHALE)) {
    return null
  }
  return undecorated.slice(DSH_WHALE.length).trim() || formatAgentTypeLabel('dsh')
}
