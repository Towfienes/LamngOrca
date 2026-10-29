// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { useAppStore } from '@/store'
import { DeckAgentAccountPicker, accountNeedsSignIn } from './DeckAgentAccountPicker'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'

vi.mock('@/lib/agent-catalog', () => ({
  AgentIcon: () => <span />,
  getAgentLabel: (agent: string) => agent
}))
const fetchUsage = vi.fn(async () => {})
const usage = (usedPercent: number): ProviderRateLimits => ({
  provider: 'codex',
  status: 'ok',
  error: null,
  session: { usedPercent, windowMinutes: 300, resetsAt: null, resetDescription: null },
  weekly: null,
  updatedAt: 1
})
const account = (id: string) => ({
  id,
  email: `${id}@example.com`,
  managedHomePath: `/accounts/${id}`,
  createdAt: 1,
  updatedAt: 1,
  lastAuthenticatedAt: 1
})

beforeEach(() => {
  useAppStore.setState({
    settings: {
      ...getDefaultSettings('/tmp/test-home'),
      codexManagedAccounts: [account('first'), account('second')],
      activeCodexManagedAccountId: 'first',
      activeCodexManagedAccountIdsByRuntime: { host: 'first', wsl: {} }
    },
    rateLimits: {
      ...useAppStore.getState().rateLimits,
      codex: usage(90),
      inactiveCodexAccounts: [
        { accountId: 'second', rateLimits: usage(20), updatedAt: 1, isFetching: false }
      ]
    },
    fetchInactiveCodexAccountUsage: fetchUsage
  })
})
afterEach(cleanup)

describe('Deck account picker', () => {
  it('shows the chosen account quota and launches it without selecting it globally', () => {
    const launch = vi.fn()
    render(<DeckAgentAccountPicker agent="codex" local onLaunch={launch} onClose={() => {}} />)
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'second@example.com' }))
    expect(
      screen.getByRole('complementary', { name: 'Account usage preview' }).textContent
    ).toContain('80% left')
    expect(launch).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Open CLI' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'second@example.com' }))
    expect(launch).toHaveBeenCalledWith('second')
    expect(useAppStore.getState().settings?.activeCodexManagedAccountId).toBe('first')
  })

  it('offers Add account when the saved roster is empty', () => {
    useAppStore.setState({
      settings: { ...getDefaultSettings('/tmp/test-home'), codexManagedAccounts: [] }
    })
    render(<DeckAgentAccountPicker agent="codex" local onLaunch={() => {}} onClose={() => {}} />)
    expect(screen.getByText('No saved accounts yet.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add account' })).toBeTruthy()
  })

  it('distinguishes a stale login from a network failure', () => {
    expect(
      accountNeedsSignIn({
        ...usage(0),
        status: 'error',
        usageMetadata: { failureKind: 'stale-token' }
      })
    ).toBe(true)
    expect(
      accountNeedsSignIn({
        ...usage(0),
        status: 'error',
        error: 'Network unavailable',
        usageMetadata: { failureKind: 'network' }
      })
    ).toBe(false)
  })

  it('does not offer local saved accounts for a remote workspace', () => {
    render(
      <DeckAgentAccountPicker agent="codex" local={false} onLaunch={() => {}} onClose={() => {}} />
    )
    expect(screen.getByText('Accounts are managed on the workspace host.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'first@example.com' })).toBeNull()
  })

  it('offers reauthentication instead of launching a revoked account', () => {
    useAppStore.setState({
      rateLimits: {
        ...useAppStore.getState().rateLimits,
        inactiveCodexAccounts: [
          {
            accountId: 'second',
            updatedAt: 1,
            isFetching: false,
            rateLimits: {
              ...usage(0),
              status: 'error',
              session: null,
              usageMetadata: { failureKind: 'stale-token' }
            }
          }
        ]
      }
    })
    const launch = vi.fn()
    render(<DeckAgentAccountPicker agent="codex" local onLaunch={launch} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'second@example.com' }))
    expect(launch).not.toHaveBeenCalled()
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'second@example.com' }))
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Open CLI' })).toBeNull()
  })

  it('re-authenticates the clicked account, never the last row the pointer crossed', async () => {
    const reauthenticate = vi.fn(async () => ({}))
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        codexAccounts: {
          reauthenticate,
          cancelPendingLogin: vi.fn(async () => true),
          getPendingLoginUrl: vi.fn(async () => null),
          onPendingLoginUrlChanged: vi.fn(() => () => {})
        }
      }
    })
    useAppStore.setState({ fetchSettings: vi.fn(async () => {}) })
    render(<DeckAgentAccountPicker agent="codex" local onLaunch={() => {}} onClose={() => {}} />)
    // Moving down to the footer crosses the other row; that must only preview it.
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'second@example.com' }))
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }))
    await vi.waitFor(() =>
      expect(reauthenticate).toHaveBeenCalledWith({
        accountId: 'first',
        activateIfSelectionWasEmpty: false
      })
    )
  })

  it('renews a signed-out account straight from its row', async () => {
    const reauthenticate = vi.fn(async () => ({}))
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        codexAccounts: {
          reauthenticate,
          cancelPendingLogin: vi.fn(async () => true),
          getPendingLoginUrl: vi.fn(async () => null),
          onPendingLoginUrlChanged: vi.fn(() => () => {})
        }
      }
    })
    useAppStore.setState({
      fetchSettings: vi.fn(async () => {}),
      rateLimits: {
        ...useAppStore.getState().rateLimits,
        inactiveCodexAccounts: [
          {
            accountId: 'second',
            updatedAt: 1,
            isFetching: false,
            rateLimits: {
              ...usage(0),
              status: 'error',
              session: null,
              usageMetadata: { failureKind: 'stale-token' }
            }
          }
        ]
      }
    })
    const launch = vi.fn()
    render(<DeckAgentAccountPicker agent="codex" local onLaunch={launch} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'second@example.com' }))
    await vi.waitFor(() =>
      expect(reauthenticate).toHaveBeenCalledWith({
        accountId: 'second',
        activateIfSelectionWasEmpty: false
      })
    )
    expect(launch).not.toHaveBeenCalled()
  })

  it('shows a loading row instead of a blank dash while usage is being fetched', () => {
    useAppStore.setState({
      rateLimits: {
        ...useAppStore.getState().rateLimits,
        inactiveCodexAccounts: [
          { accountId: 'second', rateLimits: null, updatedAt: 0, isFetching: true }
        ]
      }
    })
    render(<DeckAgentAccountPicker agent="codex" local onLaunch={() => {}} onClose={() => {}} />)
    const row = screen.getByRole('button', { name: 'second@example.com' })
    expect(row.textContent).toContain('Loading')
    expect(row.querySelector('[aria-label="Loading usage"]')).toBeTruthy()
  })

  it('opens the existing account manager from Add account', () => {
    const openSettingsTarget = vi.fn()
    const openSettingsPage = vi.fn()
    useAppStore.setState({ openSettingsTarget, openSettingsPage })
    render(<DeckAgentAccountPicker agent="codex" local onLaunch={() => {}} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add account' }))
    expect(openSettingsTarget).toHaveBeenCalledWith({
      pane: 'accounts',
      repoId: null,
      sectionId: 'accounts-codex'
    })
    expect(openSettingsPage).toHaveBeenCalledOnce()
  })
})
