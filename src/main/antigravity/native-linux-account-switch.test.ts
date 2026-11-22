import { describe, expect, it, vi } from 'vitest'
import { createAntigravityLinuxCredentialBackend } from './native-linux-credentials'
import { credential, harness, refreshedWithoutIdToken } from './native-account-test-fixtures'

type Run = Parameters<typeof createAntigravityLinuxCredentialBackend>[2]

function fakeSecretService(initial: string | null, items = 1) {
  let stored = initial
  const run = vi.fn(async ({ args, input }: { args: string[]; input?: string }) => {
    const op = args[3]
    const ok = (stdout = '', code = 0) => ({
      code,
      stdout,
      stderr: '',
      signal: null,
      timedOut: false,
      outputTruncated: false
    })
    if (items > 1) {
      return ok('', 5)
    }
    if (op === 'read') {
      return stored === null ? ok('', 44) : ok(stored)
    }
    if (op === 'write') {
      stored = input ?? null
    }
    if (op === 'clear') {
      stored = null
    }
    return ok()
  })
  return { run: run as unknown as Run, get: () => stored }
}

describe('Antigravity accounts on Linux Secret Service', () => {
  it('reads, switches and signs out the login-collection credential', async () => {
    const a = credential('a')
    const b = credential('b')
    const keyring = fakeSecretService(a)
    const backend = createAntigravityLinuxCredentialBackend(
      '/nonexistent-marker',
      undefined,
      keyring.run
    )
    expect((await backend.read())?.identity?.subject).toBe('a')
    await backend.write(b, a)
    expect(keyring.get()).toBe(b)
    await expect(backend.write(a, a)).rejects.toThrow(/changed during selection/)
    await backend.clear!(b)
    expect(await backend.read()).toBeNull()
  })

  it('refuses ambiguous duplicates instead of guessing which credential agy uses', async () => {
    const backend = createAntigravityLinuxCredentialBackend(
      '/nonexistent-marker',
      undefined,
      fakeSecretService(credential('a'), 2).run
    )
    await expect(backend.read()).rejects.toThrow(/More than one Antigravity credential/)
  })

  it('signs out for a new account only after the current account is saved', async () => {
    const h = harness(credential('a'))
    h.backend.clear = vi.fn(async () => h.setNative(null))
    await expect(h.service.signOutForNewAccount()).rejects.toThrow(/Save the current agy account/)
    expect(h.getNative()).not.toBeNull()
    await h.service.addCurrentAccount()
    const state = await h.service.signOutForNewAccount()
    expect(h.getNative()).toBeNull()
    expect(state.currentAccount).toBeNull()
    expect(state.accounts).toHaveLength(1)
  })

  it('keeps a token refreshed by an inactive usage probe only for the same unchanged account', async () => {
    const h = harness(credential('a'))
    await h.service.addCurrentAccount()
    h.setNative(credential('b'))
    await h.service.addCurrentAccount()
    const [inactive] = await h.service.inactiveCredentials()
    expect(h.getVault().accounts.find((x) => x.id === inactive.id)?.subject).toBe('a')
    await h.service.updateInactiveCredential(inactive.id, inactive.credentials, credential('b', 2))
    expect(h.getVault().accounts.find((x) => x.id === inactive.id)?.credentials).toBe(
      inactive.credentials
    )
    const refreshed = refreshedWithoutIdToken(3)
    await h.service.updateInactiveCredential(inactive.id, inactive.credentials, refreshed)
    expect(h.getVault().accounts.find((x) => x.id === inactive.id)?.credentials).toBe(refreshed)
  })
})
