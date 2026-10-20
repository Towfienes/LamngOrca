import { expect, it } from 'vitest'
import { claudeResumeAccountEnv } from './claude-resume-account-env'
import type { ClaudeManagedAccount } from '../../../shared/managed-account-types'

const account: ClaudeManagedAccount = {
  id: 'old-account',
  email: 'old@example.invalid',
  managedAuthPath: '/accounts/old/auth',
  createdAt: 1,
  updatedAt: 1,
  lastAuthenticatedAt: 1,
  authMethod: 'subscription-oauth'
}
const args = {
  agent: 'claude',
  local: true,
  agentEnv: { EXISTING: 'keep' },
  accounts: [account],
  transcriptPath: '/accounts/old/auth/projects/worktree/session.jsonl'
}
it('restores legacy Claude under the transcript owner instead of the current global account', () => {
  expect(claudeResumeAccountEnv(args)).toEqual({
    EXISTING: 'keep',
    ORCA_AGENT_LAUNCH_ACCOUNT_ID: 'old-account'
  })
  expect(args.agentEnv).toEqual({ EXISTING: 'keep' })
})
it('keeps an explicitly chosen account', () => {
  const agentEnv = { ORCA_AGENT_LAUNCH_ACCOUNT_ID: 'explicit' }
  expect(claudeResumeAccountEnv({ ...args, agentEnv })).toBe(agentEnv)
})
it.each([
  { local: false },
  { agent: 'codex' },
  { transcriptPath: '/accounts/old/auth/projects-other/session.jsonl' },
  { transcriptPath: '/accounts/old/auth/projects/../../other/session.jsonl' },
  { accounts: [account, { ...account, id: 'duplicate' }] },
  { accounts: [{ ...account, managedAuthRuntime: 'wsl' as const }] }
])('does not guess an account for %j', (override) => {
  expect(claudeResumeAccountEnv({ ...args, ...override })).toBe(args.agentEnv)
})
