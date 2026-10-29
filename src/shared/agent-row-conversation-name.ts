// Resolves the stable name an agent session shows in the sidebar and its pane header.
// Precedence: the user's pane rename → the tab's own rename/quick command when the tab
// holds just this pane → DSH's native session title → the provider title of THIS
// session → OpenCode's semantic title → the pane's live agent-set title.
// A name must belong to this session: tab-wide names never label a split tab's
// agents, and Orca's generated tab title (a clipped first prompt) is never a name.
// Status, identity-echo, cwd, prompt-shaped and system text yield null so callers
// fall back to a neutral label.
import type { AgentType } from './agent-status-types'
import { isClaudeManagementTitle } from './agent-title-core'
import { stripLeadingAgentTitleDecorationOrEmpty } from './agent-title-decoration'
import { formatAgentTypeLabel } from './agent-type-label'
import { isJcodeIdentityTerminalTitle } from './jcode-terminal-title'
import { isMeaningfulOpenCodeTerminalTitle } from './opencode-terminal-title'
import { getDshTerminalSessionTitle } from './dsh-terminal-title'
import { SYNTHETIC_AGENT_TITLE_PROFILES } from './synthetic-agent-title'
import type { TerminalTab } from './terminal-tab-types'

export type ConversationNameTab = Pick<
  TerminalTab,
  'customTitle' | 'quickCommandLabel' | 'aiVaultTitle' | 'title' | 'defaultTitle'
>

// Synthetic status labels describe state rather than a conversation name.
const SYNTHETIC_STATUS_TITLES_LOWER: ReadonlySet<string> = new Set(
  Object.values(SYNTHETIC_AGENT_TITLE_PROFILES).flatMap((profile) => [
    profile.workingLabel.toLowerCase(),
    profile.permissionLabel.toLowerCase(),
    profile.idleLabel.toLowerCase()
  ])
)

// Retained-tab fallback Agent is a placeholder, never a conversation name.
const FALLBACK_TAB_TITLE_LOWER = 'agent'

const AGENT_IDENTITY_ALIASES_LOWER: Readonly<Record<string, readonly string[]>> = {
  claude: ['claude code'],
  gemini: ['gemini cli']
}

const STATUS_WITH_CONTEXT_RE = /^(?:ready|idle|done)(?:\s+\([^)]*\))?$/i
const DEFAULT_TERMINAL_TITLE_RE = /^terminal \d+$/i

function isIdentityStatusTitle(titleLower: string, identityLower: string): boolean {
  return (
    titleLower === identityLower ||
    titleLower === `${identityLower} ready` ||
    titleLower === `${identityLower} idle` ||
    titleLower === `${identityLower} done` ||
    titleLower === `${identityLower} working` ||
    titleLower === `${identityLower} thinking` ||
    titleLower === `${identityLower} running` ||
    titleLower === `${identityLower} - action required`
  )
}

function isAgentIdentityStatusTitle(
  titleLower: string,
  agentType: AgentType | null | undefined,
  agentTypeLabelLower: string
): boolean {
  if (isIdentityStatusTitle(titleLower, agentTypeLabelLower)) {
    return true
  }
  return (
    AGENT_IDENTITY_ALIASES_LOWER[agentType ?? '']?.some((identity) =>
      isIdentityStatusTitle(titleLower, identity)
    ) ?? false
  )
}

function isCwdLikeTitle(title: string): boolean {
  // Hookless SSH titles may contain only spinner+cwd, never a conversation name (#8711).
  if (/^(?:~|[\\/]|[A-Za-z]:[\\/])/.test(title)) {
    return true
  }
  // A single path-ish token ("orca/workspaces") is still a cwd, not a name.
  return !/\s/.test(title) && /[\\/]/.test(title)
}

// Why: injected harness/system text (`<local-command-caveat>`, skill front matter, a
// line-numbered file dump) leaks into prompt-derived titles; it never names a session.
const MARKUP_TAG_RE = /<\/?[a-z][\w-]*(?:\s[^>]*)?>/i
const FRONT_MATTER_RE = /^(?:\d+\s+)?---(?:\s|$)/
const YAML_KEYS_RE = /\b(?:name|description):\s/
const SLASH_COMMAND_RE = /^\/[\w:-]+(?:\s|$)/
// Why: generated session names are a few words; a long sentence is a prompt, and
// clipping it would only fake a summary.
const MAX_SESSION_NAME_WORDS = 10
const MAX_SESSION_NAME_LENGTH = 80

/** True when the text is system/markup output rather than something a person named. */
export function isSystemTextTitle(text: string): boolean {
  const trimmed = text.trim()
  return (
    /[\r\n]/.test(trimmed) ||
    MARKUP_TAG_RE.test(trimmed) ||
    FRONT_MATTER_RE.test(trimmed) ||
    YAML_KEYS_RE.test(trimmed)
  )
}

/** True when an automatic title is short, plain text that can stand as a session name. */
export function isUsableAgentSessionName(text: string | null | undefined): text is string {
  const trimmed = text?.trim() ?? ''
  return (
    trimmed.length > 0 &&
    trimmed.length <= MAX_SESSION_NAME_LENGTH &&
    trimmed.split(/\s+/).length <= MAX_SESSION_NAME_WORDS &&
    !isSystemTextTitle(trimmed) &&
    !SLASH_COMMAND_RE.test(trimmed)
  )
}

function conversationNameFromLiveTitle(
  liveTitle: string,
  agentType: AgentType | null | undefined,
  agentTypeLabelLower: string,
  defaultTitle: string | undefined
): string | null {
  const stripped = stripLeadingAgentTitleDecorationOrEmpty(liveTitle.trim()).trim()
  if (!stripped) {
    return null
  }
  const lower = stripped.toLowerCase()
  if (
    SYNTHETIC_STATUS_TITLES_LOWER.has(lower) ||
    lower === FALLBACK_TAB_TITLE_LOWER ||
    isAgentIdentityStatusTitle(lower, agentType, agentTypeLabelLower) ||
    STATUS_WITH_CONTEXT_RE.test(stripped) ||
    DEFAULT_TERMINAL_TITLE_RE.test(stripped) ||
    isClaudeManagementTitle(stripped) ||
    // jcode repaints codename/diff/duration each second; accepting that identity hides the prompt preview.
    isJcodeIdentityTerminalTitle(stripped) ||
    isCwdLikeTitle(stripped)
  ) {
    return null
  }
  if (defaultTitle && stripped === defaultTitle.trim()) {
    return null
  }
  return isUsableAgentSessionName(stripped) ? stripped : null
}

export type AgentSessionNameSources = {
  /** The user's rename of this pane (`titlesByLeafId`), the strongest name. */
  manualPaneTitle?: string | null
  /** The provider title resolved for this row's own session id. */
  providerSessionTitle?: string | null
  /** This pane's own terminal title saved when it slept; stands in until it paints a new one. */
  recordedTitle?: string | null
}

/**
 * The name for an agent session, or null when nothing trustworthy exists and the
 * caller should show a neutral label.
 */
export function getAgentRowConversationName(
  tab: ConversationNameTab,
  agentType: AgentType | null | undefined,
  // Why: `tab.title` carries only the FOCUSED pane's title, so in a split tab it
  // names one pane and mislabels its siblings. Callers on a multi-pane tab pass
  // this row's own pane title, or `null` when none resolves; `undefined` (a
  // single-pane tab) keeps the tab title and the tab's own names.
  paneLiveTitle?: string | null,
  providerSessionId?: string,
  sources: AgentSessionNameSources = {}
): string | null {
  const manualPaneTitle = sources.manualPaneTitle?.trim()
  if (manualPaneTitle && !isSystemTextTitle(manualPaneTitle)) {
    return manualPaneTitle
  }
  // Why: tab-wide names belong to one agent only when the tab holds just its pane.
  const ownsTab = paneLiveTitle === undefined
  const customTitle = ownsTab ? tab.customTitle?.trim() : ''
  if (customTitle) {
    return customTitle
  }
  const quickCommandLabel = ownsTab ? tab.quickCommandLabel?.trim() : ''
  if (quickCommandLabel) {
    return quickCommandLabel
  }
  const liveTitle =
    (ownsTab ? tab.title?.trim() : paneLiveTitle?.trim()) || sources.recordedTitle?.trim() || ''
  // DSH owns its session title; a tab's generated prompt can belong to a sibling pane.
  if (agentType === 'dsh') {
    const dshTitle = getDshTerminalSessionTitle(liveTitle)
    return isUsableAgentSessionName(dshTitle) ? dshTitle : formatAgentTypeLabel('dsh')
  }
  // Provider titles belong to their session, not every pane in the tab.
  const providerTitle =
    sources.providerSessionTitle?.trim() ||
    (tab.aiVaultTitle &&
    tab.aiVaultTitle.agent === agentType &&
    tab.aiVaultTitle.sessionId === providerSessionId
      ? tab.aiVaultTitle.title.trim()
      : '')
  if (providerSessionId && isUsableAgentSessionName(providerTitle)) {
    return providerTitle
  }
  if (isMeaningfulOpenCodeTerminalTitle(liveTitle) && isUsableAgentSessionName(liveTitle)) {
    return liveTitle
  }
  if (!liveTitle) {
    return null
  }
  return conversationNameFromLiveTitle(
    liveTitle,
    agentType,
    formatAgentTypeLabel(agentType).toLowerCase(),
    tab.defaultTitle
  )
}
