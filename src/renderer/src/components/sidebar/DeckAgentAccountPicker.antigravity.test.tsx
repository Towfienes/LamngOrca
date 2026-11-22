// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { DeckAgentAccountPicker } from './DeckAgentAccountPicker'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'

vi.mock('@/lib/agent-catalog', () => ({
  AgentIcon: () => <span />,
  getAgentLabel: (agent: string) => agent
}))
const calls: string[] = []
const summary = (id: string) => ({
  id,
  email: `${id}@example.com`,
  subject: id,
  authMethod: 'consumer',
  createdAt: 1,
  updatedAt: 1
})
let active = 'first'
const state = () => ({
  accounts: [summary('first'), summary('second')],
  activeAccountId: active,
  selectedAccountId: active,
  currentAccount: { email: null, subject: active, authMethod: 'consumer', identityKnown: true }
})
const usage = (usedPercent: number): ProviderRateLimits => ({
  provider: 'antigravity',
  status: 'ok',
  error: null,
  session: { usedPercent, windowMinutes: 300, resetsAt: null, resetDescription: null },
  weekly: null,
  updatedAt: 1
})
let locked = false
vi.mock('@/runtime/runtime-antigravity-accounts-client', () => ({
  callAntigravityAccounts: vi.fn(async (_o: unknown, _t: unknown, action: string, id?: string) => {
    calls.push(id ? `${action}:${id}` : action)
    if (locked) {
      throw new Error(
        'Protected secret storage is unavailable; Antigravity accounts were not changed.'
      )
    }
    if (action === 'Select' && id) {
      active = id
    }
    return state()
  }),
  callAntigravityInactiveUsage: vi.fn(async () => ({ second: usage(30) }))
}))

beforeEach(() => {
  locked = false
  active = 'first'
  calls.length = 0
  useAppStore.setState({
    rateLimits: { ...useAppStore.getState().rateLimits, antigravity: usage(90) },
    refreshRateLimits: vi.fn(async () => {})
  })
})
afterEach(cleanup)

describe('Deck agy account picker', () => {
  it('lists saved agy accounts with their own quota and switches before launching', async () => {
    const launch = vi.fn()
    render(
      <DeckAgentAccountPicker agent="antigravity" local onLaunch={launch} onClose={() => {}} />
    )
    const second = await screen.findByRole('button', { name: 'second@example.com' })
    expect(screen.queryByText(/not supported yet/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'Current agy account' })).toBeNull()
    await waitFor(() => expect(second.textContent).toContain('70% left'))
    expect(screen.getByRole('button', { name: 'first@example.com' }).textContent).toContain(
      '10% left'
    )
    fireEvent.click(second)
    await waitFor(() => expect(launch).toHaveBeenCalledWith(undefined))
    expect(calls).toContain('Select:second')
  })

  it('saves the signed-in account, signs agy out, then opens agy to add another', async () => {
    const launch = vi.fn()
    render(
      <DeckAgentAccountPicker agent="antigravity" local onLaunch={launch} onClose={() => {}} />
    )
    await screen.findByRole('button', { name: 'first@example.com' })
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }))
    await waitFor(() => expect(launch).toHaveBeenCalledWith(undefined))
    expect(calls.at(-1)).toBe('SignOutForNewAccount')
  })

  it('still offers the current agy account when saved accounts are locked for this run', async () => {
    locked = true
    const launch = vi.fn()
    render(
      <DeckAgentAccountPicker agent="antigravity" local onLaunch={launch} onClose={() => {}} />
    )
    await screen.findByText(/locked for this Orca run/)
    fireEvent.click(screen.getByRole('button', { name: 'Current agy account' }))
    await waitFor(() => expect(launch).toHaveBeenCalledWith(undefined))
  })
})
