import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { seedClaudeProfileFromLegacyLogin } from './claude-profile-legacy-login'

const LOGIN = { emailAddress: 'a@example.com', organizationUuid: 'org-a' }

describe('seedClaudeProfileFromLegacyLogin', () => {
  let root: string
  let legacy: string
  let profile: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'claude-legacy-login-'))
    legacy = join(root, 'claude-accounts', 'acct', 'auth')
    profile = join(root, 'claude-profiles', 'acct', 'home')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, '.claude.json'), JSON.stringify({ oauthAccount: LOGIN }))
    writeFileSync(join(legacy, '.credentials.json'), '{"token":"legacy"}')
  })
  afterEach(() => rmSync(root, { recursive: true, force: true }))

  it('carries the legacy login into an empty profile and keeps the legacy folder', () => {
    expect(seedClaudeProfileFromLegacyLogin(profile, legacy)).toBe(true)
    const state = JSON.parse(readFileSync(join(profile, '.claude.json'), 'utf8'))
    expect(state.oauthAccount).toEqual(LOGIN)
    expect(readFileSync(join(profile, '.credentials.json'), 'utf8')).toBe('{"token":"legacy"}')
    if (process.platform !== 'win32') {
      expect(statSync(join(profile, '.credentials.json')).mode & 0o777).toBe(0o600)
    }
    expect(readFileSync(join(legacy, '.credentials.json'), 'utf8')).toBe('{"token":"legacy"}')
  })

  it('never replaces a login the profile already has', () => {
    mkdirSync(profile, { recursive: true })
    const own = { emailAddress: 'b@example.com' }
    writeFileSync(join(profile, '.claude.json'), JSON.stringify({ oauthAccount: own }))
    writeFileSync(join(profile, '.credentials.json'), '{"token":"own"}')
    expect(seedClaudeProfileFromLegacyLogin(profile, legacy)).toBe(false)
    expect(JSON.parse(readFileSync(join(profile, '.claude.json'), 'utf8')).oauthAccount).toEqual(
      own
    )
    expect(readFileSync(join(profile, '.credentials.json'), 'utf8')).toBe('{"token":"own"}')
  })

  it('skips a legacy folder without credentials', () => {
    rmSync(join(legacy, '.credentials.json'))
    expect(seedClaudeProfileFromLegacyLogin(profile, legacy)).toBe(false)
    expect(seedClaudeProfileFromLegacyLogin(profile, undefined)).toBe(false)
  })
})
