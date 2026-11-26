/** One plan-covered DeepRelay model, as cached by the `deeprelay` launcher's plan probe. */
export type DeeprelayModel = {
  id: string
  /** Short id used on the launcher row, e.g. `deepseek-v4.1-flash`. */
  label: string
  ctx: number | null
  out: number | null
  vision: boolean
}

export type DeeprelayModelList =
  | {
      available: true
      defaultId: string
      models: DeeprelayModel[]
      base: string | null
      /** When the launcher last wrote its plan probe; null while no cache exists yet. */
      fetchedAt: number | null
    }
  | { available: false; reason: string; fetchedAt: number }

/**
 * Whether a Claude transcript belongs to the DeepRelay profile (~/.claude-deeprelay).
 * Those sessions only exist there and must resume with `deeprelay`, never plain `claude`.
 */
export function isDeeprelayTranscriptPath(path: string | null | undefined): boolean {
  return typeof path === 'string' && /[\\/]\.claude-deeprelay[\\/]/.test(path)
}
