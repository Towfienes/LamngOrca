import { join } from 'node:path'
import { AGENT_LAUNCH_ACCOUNT_ENV } from '../../../../shared/agent-launch-account'
import { getAppEnvironment } from '../../../../shared/app-environment'
import type { GlobalSettings } from '../../../../shared/global-settings-types'
import { assertOwnedHostCodexManagedHomePath } from '../../../codex-accounts/host-codex-managed-home-ownership'
import { getSystemCodexHomePath } from '../../../codex/codex-home-paths'
import type { CodexAccountSelectionTarget } from '../../../codex-accounts/runtime-selection'

export function resolvePinnedCodexLaunchHome(
  args: {
    launchAgent?: string
    env?: Record<string, string | undefined>
    connectionId?: string | null
  },
  target: CodexAccountSelectionTarget,
  settings: GlobalSettings | undefined
): string | undefined {
  const accountId = args.env?.[AGENT_LAUNCH_ACCOUNT_ENV]
  if (args.launchAgent !== 'codex' || accountId === undefined) {
    return undefined
  }
  const account = settings?.codexManagedAccounts.find((entry) => entry.id === accountId)
  if (
    args.connectionId ||
    target.runtime === 'wsl' ||
    !account ||
    account.managedHomeRuntime === 'wsl'
  ) {
    throw new Error('This Codex account is not available on this host.')
  }
  return assertOwnedHostCodexManagedHomePath({
    candidatePath: account.managedHomePath,
    managedAccountsRoot: join(getAppEnvironment().getPath('userData'), 'codex-accounts'),
    systemCodexHomePath: getSystemCodexHomePath(),
    expectedAccountId: account.id
  })
}
