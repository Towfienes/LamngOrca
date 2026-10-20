import type { ClaudeManagedAccount } from './managed-account-types'
import { relativePathInsideRoot, normalizeRuntimePathSeparators } from './cross-platform-path'

export const AGENT_LAUNCH_ACCOUNT_ENV = 'ORCA_AGENT_LAUNCH_ACCOUNT_ID'

export function findClaudeTranscriptAccount(
  accounts: readonly ClaudeManagedAccount[] | undefined,
  transcriptPath: string | undefined
): ClaudeManagedAccount | undefined {
  if (!transcriptPath || normalizeRuntimePathSeparators(transcriptPath).split('/').includes('..')) {
    return undefined
  }
  const matches = accounts?.filter(
    (account) =>
      account.managedAuthRuntime !== 'wsl' &&
      account.managedAuthPath &&
      relativePathInsideRoot(account.managedAuthPath, transcriptPath)?.startsWith('projects/')
  )
  return matches?.length === 1 ? matches[0] : undefined
}
