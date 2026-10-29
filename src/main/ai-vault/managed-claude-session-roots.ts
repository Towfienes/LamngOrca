import { isAbsolute, join, relative } from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import type { GlobalSettings } from '../../shared/global-settings-types'

/** `projects` folders of Deck accounts signed in before per-account profiles, so their history stays listed. */
export function managedClaudeSessionRoots(settings: GlobalSettings): string[] {
  const accountsRoot = join(getAppEnvironment().getPath('userData'), 'claude-accounts')
  return settings.claudeManagedAccounts.flatMap((account) => {
    if (account.managedAuthRuntime === 'wsl' || !account.managedAuthPath) {
      return []
    }
    // Only Orca's own legacy folder for this account; a profile home links ~/.claude, already scanned.
    const inside = relative(join(accountsRoot, account.id), account.managedAuthPath)
    return inside === '' || (!inside.startsWith('..') && !isAbsolute(inside))
      ? [join(account.managedAuthPath, 'projects')]
      : []
  })
}
