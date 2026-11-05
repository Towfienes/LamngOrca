export type TerminalRevealIdentity = {
  worktreeId: string
  tabId: string
  leafId: string
  ptyId: string
}

export type TerminalTabCreateReply = {
  requestId: string
  tabId?: string
  /** Set when the terminal joined an existing tab as a split pane instead of opening a tab. */
  leafId?: string
  title?: string
  identity?: TerminalRevealIdentity
  error?: string
}
