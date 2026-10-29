import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { isDefinitiveAbsence } from '../../shared/definitive-filesystem-absence'
import type { ClaudeManagedAccount } from '../../shared/managed-account-types'
import { writeFileAtomically } from '../codex-accounts/fs-utils'
import { claudeStateFile, type ClaudeFolderLogin } from './claude-account-folder'
import { readClaudeProfileObject } from './claude-profile-paths'

const CREDENTIALS_FILE = '.credentials.json'

/** Thrown when a re-authentication signs in as a different Claude account than the one being renewed. */
export class ClaudeReauthIdentityMismatchError extends Error {}

export function assertSameClaudeIdentity(
  account: Pick<ClaudeManagedAccount, 'email' | 'organizationUuid'>,
  login: Pick<ClaudeFolderLogin, 'email' | 'organizationUuid'>
): void {
  const sameEmail = account.email.trim().toLowerCase() === login.email.trim().toLowerCase()
  const sameOrganization =
    !account.organizationUuid ||
    !login.organizationUuid ||
    account.organizationUuid === login.organizationUuid
  if (!sameEmail || !sameOrganization) {
    throw new ClaudeReauthIdentityMismatchError(
      `Signed in as ${login.email}, but this account is ${account.email}. ` +
        `Nothing was changed. Sign in as ${account.email}, or add the other account separately.`
    )
  }
}

/** The folder's login before a re-authentication, so a wrong-account sign-in can be undone. */
export type ClaudeFolderLoginSnapshot = {
  credentials: Buffer | null
  oauthAccount: unknown
}

export function snapshotClaudeFolderLogin(folder: string): ClaudeFolderLoginSnapshot | null {
  const state = readClaudeProfileObject(claudeStateFile(folder))
  if (state.kind === 'unavailable') {
    return null
  }
  let credentials: Buffer | null = null
  try {
    credentials = readFileSync(join(folder, CREDENTIALS_FILE))
  } catch (error) {
    if (!isDefinitiveAbsence(error)) {
      return null
    }
  }
  return {
    credentials,
    oauthAccount: state.kind === 'present' ? state.value.oauthAccount : undefined
  }
}

export function restoreClaudeFolderLogin(
  folder: string,
  snapshot: ClaudeFolderLoginSnapshot
): void {
  const credentialsPath = join(folder, CREDENTIALS_FILE)
  if (snapshot.credentials) {
    writeFileAtomically(credentialsPath, snapshot.credentials, { mode: 0o600 })
  } else {
    rmSync(credentialsPath, { force: true })
  }
  const stateFile = claudeStateFile(folder)
  const state = readClaudeProfileObject(stateFile)
  const current = state.kind === 'present' ? { ...state.value } : {}
  if (snapshot.oauthAccount === undefined) {
    delete current.oauthAccount
  } else {
    current.oauthAccount = snapshot.oauthAccount
  }
  writeFileAtomically(stateFile, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600 })
}
