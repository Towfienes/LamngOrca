/** One 9router model as reported by `claude9 --list --json` (the deck's claude9 launcher). */
export type Claude9Model = {
  /** Short name from ~/.config/claude9/aliases, or null for an un-aliased model. */
  alias: string | null
  id: string
  label: string
  ctx: number | null
  out: number | null
  vision: boolean
  /** Measured reasoning behaviour from ~/.config/claude9/reasoning, or null when not probed. */
  reasoning?: string | null
  combo: boolean
}

export type Claude9ModelList =
  | {
      available: true
      defaultId: string
      models: Claude9Model[]
      fetchedAt: number
    }
  | { available: false; reason: string; fetchedAt: number }

/**
 * Whether a Claude hook transcript belongs to claude9 (its own CLAUDE_CONFIG_DIR, ~/.claude-9router).
 * Such a session only exists there, so it must be resumed with `claude9`, never plain `claude`.
 */
export function isClaude9TranscriptPath(path: string | null | undefined): boolean {
  return typeof path === 'string' && /[\\/]\.claude-9router[\\/]/.test(path)
}
