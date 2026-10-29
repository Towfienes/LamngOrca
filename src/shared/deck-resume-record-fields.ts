/** Deck keeps the pane's PTY and the agent's model/effort so a saved session reopens as it ran. */
export type DeckResumeRecordFields = {
  ptyId?: string
  model?: string
  reasoningEffort?: string
}
