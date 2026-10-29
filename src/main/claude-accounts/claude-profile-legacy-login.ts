import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import { claudeStateFile, claudeStateLogin } from './claude-account-folder'
import { readClaudeProfileObject } from './claude-profile-paths'

const CREDENTIALS_FILE = '.credentials.json'

/**
 * Lamng accounts signed in inside their own managed folder before profiles existed. Carry that
 * login into the profile once so the upgrade signs nobody out; the legacy folder is left intact.
 */
export function seedClaudeProfileFromLegacyLogin(
  profileHome: string,
  legacyAuthPath: string | undefined
): boolean {
  if (!legacyAuthPath) {
    return false
  }
  const legacyCredentials = join(legacyAuthPath, CREDENTIALS_FILE)
  const legacyState = readClaudeProfileObject(claudeStateFile(legacyAuthPath))
  if (
    legacyState.kind !== 'present' ||
    !claudeStateLogin(legacyState.value) ||
    !existsSync(legacyCredentials)
  ) {
    return false
  }
  mkdirSync(profileHome, { recursive: true, mode: 0o700 })
  const profileStateFile = claudeStateFile(profileHome)
  const profileState = readClaudeProfileObject(profileStateFile)
  if (profileState.kind === 'unavailable') {
    return false
  }
  const current = profileState.kind === 'present' ? profileState.value : {}
  if (claudeStateLogin(current)) {
    return false
  }
  const profileCredentials = join(profileHome, CREDENTIALS_FILE)
  if (!existsSync(profileCredentials)) {
    writeFileAtomically(profileCredentials, readFileSync(legacyCredentials), { mode: 0o600 })
  }
  writeFileAtomically(
    profileStateFile,
    `${JSON.stringify({ ...current, oauthAccount: legacyState.value.oauthAccount }, null, 2)}\n`,
    { mode: 0o600 }
  )
  return true
}

/** Run before the first route is published, so an account's first launch already has its login. */
export function seedLegacyClaudeLogins(
  settings: GlobalSettings,
  accountHome: (accountId: string) => string
): void {
  for (const account of settings.claudeManagedAccounts) {
    if (account.managedAuthRuntime === 'wsl') {
      continue
    }
    try {
      seedClaudeProfileFromLegacyLogin(accountHome(account.id), account.managedAuthPath)
    } catch (error) {
      console.warn('[claude-profile] Could not carry over an account login:', error)
    }
  }
}
