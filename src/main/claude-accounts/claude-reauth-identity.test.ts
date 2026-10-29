import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  ClaudeReauthIdentityMismatchError,
  assertSameClaudeIdentity,
  restoreClaudeFolderLogin,
  snapshotClaudeFolderLogin
} from './claude-reauth-identity'

describe('assertSameClaudeIdentity', () => {
  const account = { email: 'Owner@Example.com', organizationUuid: 'org-a' }

  it('accepts the same login regardless of email case', () => {
    expect(() =>
      assertSameClaudeIdentity(account, { email: 'owner@example.com', organizationUuid: 'org-a' })
    ).not.toThrow()
  })

  it('refuses a browser that signed in as someone else or another organization', () => {
    expect(() =>
      assertSameClaudeIdentity(account, { email: 'other@example.com', organizationUuid: 'org-a' })
    ).toThrow(ClaudeReauthIdentityMismatchError)
    expect(() =>
      assertSameClaudeIdentity(account, { email: 'owner@example.com', organizationUuid: 'org-b' })
    ).toThrow(ClaudeReauthIdentityMismatchError)
  })
})

describe('Claude folder login snapshot', () => {
  let folder: string
  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'claude-reauth-'))
  })
  afterEach(() => rmSync(folder, { recursive: true, force: true }))

  it('restores the previous login after a wrong-account sign-in', () => {
    writeFileSync(
      join(folder, '.claude.json'),
      JSON.stringify({ oauthAccount: { emailAddress: 'owner@example.com' }, theme: 'dark' })
    )
    writeFileSync(join(folder, '.credentials.json'), '{"token":"owner"}')
    const snapshot = snapshotClaudeFolderLogin(folder)
    expect(snapshot).not.toBeNull()
    writeFileSync(
      join(folder, '.claude.json'),
      JSON.stringify({ oauthAccount: { emailAddress: 'other@example.com' }, theme: 'dark' })
    )
    writeFileSync(join(folder, '.credentials.json'), '{"token":"other"}')

    restoreClaudeFolderLogin(folder, snapshot!)

    const state = JSON.parse(readFileSync(join(folder, '.claude.json'), 'utf8'))
    expect(state).toEqual({ oauthAccount: { emailAddress: 'owner@example.com' }, theme: 'dark' })
    expect(readFileSync(join(folder, '.credentials.json'), 'utf8')).toBe('{"token":"owner"}')
  })

  it('removes a login written into a folder that had none', () => {
    const snapshot = snapshotClaudeFolderLogin(folder)
    writeFileSync(
      join(folder, '.claude.json'),
      JSON.stringify({ oauthAccount: { emailAddress: 'other@example.com' } })
    )
    writeFileSync(join(folder, '.credentials.json'), '{"token":"other"}')

    restoreClaudeFolderLogin(folder, snapshot!)

    expect(JSON.parse(readFileSync(join(folder, '.claude.json'), 'utf8'))).toEqual({})
    expect(existsSync(join(folder, '.credentials.json'))).toBe(false)
  })
})
