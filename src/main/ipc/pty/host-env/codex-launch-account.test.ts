import { beforeEach, describe, expect, it, vi } from 'vitest'
import { join } from 'node:path'
import { getDefaultSettings } from '../../../../shared/constants'
import { resolvePinnedCodexLaunchHome } from './codex-launch-account'

const ownership = vi.hoisted(() =>
  vi.fn(({ candidatePath }: { candidatePath: string }) => candidatePath)
)
vi.mock('../../../../shared/app-environment', () => ({
  getAppEnvironment: () => ({ getPath: () => '/user-data' })
}))
vi.mock('../../../codex/codex-home-paths', () => ({
  getSystemCodexHomePath: () => '/system-home/.codex'
}))
vi.mock('../../../codex-accounts/host-codex-managed-home-ownership', () => ({
  assertOwnedHostCodexManagedHomePath: ownership
}))

const settings = {
  ...getDefaultSettings('/tmp/test-home'),
  codexManagedAccounts: [
    {
      id: 'account-b',
      email: 'b@example.invalid',
      managedHomePath: '/accounts/b/home',
      createdAt: 1,
      updatedAt: 1,
      lastAuthenticatedAt: 1
    }
  ]
}
const args = { launchAgent: 'codex', env: { ORCA_AGENT_LAUNCH_ACCOUNT_ID: 'account-b' } }
describe('per-session Codex launch account', () => {
  beforeEach(() => {
    ownership.mockClear()
  })
  it('validates the saved account home in the Orca-owned root', () => {
    expect(resolvePinnedCodexLaunchHome(args, { runtime: 'host' }, settings)).toBe(
      '/accounts/b/home'
    )
    expect(ownership).toHaveBeenCalledWith({
      candidatePath: '/accounts/b/home',
      expectedAccountId: 'account-b',
      managedAccountsRoot: join('/user-data', 'codex-accounts'),
      systemCodexHomePath: '/system-home/.codex'
    })
  })
  it('refuses unknown account identifiers', () => {
    expect(() =>
      resolvePinnedCodexLaunchHome(
        { ...args, env: { ORCA_AGENT_LAUNCH_ACCOUNT_ID: 'unknown' } },
        { runtime: 'host' },
        settings
      )
    ).toThrow('not available')
    expect(ownership).not.toHaveBeenCalled()
  })
  it('does not send a native account into SSH or WSL', () => {
    expect(() =>
      resolvePinnedCodexLaunchHome(
        { ...args, connectionId: 'ssh-1' },
        { runtime: 'host' },
        settings
      )
    ).toThrow('not available')
    expect(() =>
      resolvePinnedCodexLaunchHome(args, { runtime: 'wsl', wslDistro: 'Ubuntu' }, settings)
    ).toThrow('not available')
  })
  it('leaves launches without an explicit account untouched', () => {
    expect(
      resolvePinnedCodexLaunchHome({ launchAgent: 'codex' }, { runtime: 'host' }, settings)
    ).toBeUndefined()
    expect(
      resolvePinnedCodexLaunchHome(
        { ...args, launchAgent: 'claude' },
        { runtime: 'host' },
        settings
      )
    ).toBeUndefined()
    expect(ownership).not.toHaveBeenCalled()
  })
})
