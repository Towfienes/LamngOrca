import type { RuntimeTerminalPresentation } from '../../shared/runtime-types'
import { createTerminalRevealWarning } from './orca-runtime-core'
import type { RuntimeNotifier } from './runtime-notifier-contract'

type RevealOptions = Omit<
  Parameters<NonNullable<RuntimeNotifier['revealTerminalSession']>>[1],
  'activate' | 'presentation'
>

/** Shows a host-spawned terminal in the renderer; a failed or impossible reveal is a warning, not an error. */
export async function revealCreatedTerminal(
  notifier: RuntimeNotifier | null | undefined,
  worktreeId: string,
  presentation: RuntimeTerminalPresentation | undefined,
  handle: string,
  reveal: RevealOptions
): Promise<{ surface: 'visible' | 'background'; warning?: string }> {
  if (presentation === 'background') {
    return { surface: 'background' }
  }
  if (!notifier?.revealTerminalSession) {
    return { surface: 'background', warning: createTerminalRevealWarning(handle) }
  }
  try {
    await notifier.revealTerminalSession(worktreeId, {
      ...reveal,
      activate: presentation === 'focused',
      ...(presentation ? { presentation } : {})
    })
    return { surface: 'visible' }
  } catch (err) {
    console.warn(`[terminal-create] failed to create inactive tab for ${reveal.ptyId}:`, err)
    return { surface: 'background', warning: createTerminalRevealWarning(handle, err) }
  }
}
