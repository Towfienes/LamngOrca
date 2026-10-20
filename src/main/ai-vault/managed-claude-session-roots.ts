import { join } from 'node:path'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { resolveOwnedClaudeManagedAuthPath } from '../claude-accounts/managed-auth-path'

export function managedClaudeSessionRoots(settings: GlobalSettings): string[] {
  return settings.claudeManagedAccounts.flatMap((account) => {
    if (account.managedAuthRuntime === 'wsl') {return []}
    const root = resolveOwnedClaudeManagedAuthPath(account.id, account.managedAuthPath)
    return root ? [join(root, 'projects')] : []
  })
}
