// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { useAppStore } from '@/store'
import { DeckAgentAccountPicker } from './DeckAgentAccountPicker'
import type { Claude9ModelList } from '../../../../shared/claude9-models'

vi.mock('@/lib/agent-catalog', () => ({
  AgentIcon: () => <span />,
  getAgentLabel: (agent: string) => agent
}))

const models: Claude9ModelList = {
  available: true,
  defaultId: 'Lamng/ds',
  fetchedAt: Date.now(),
  models: [
    {
      alias: 'ds',
      id: 'Lamng/ds',
      label: 'ds',
      ctx: 1_000_000,
      out: 128_000,
      vision: true,
      combo: false,
      reasoning: 'Effort-scaled, can turn off'
    },
    {
      alias: null,
      id: 'Gpt',
      label: 'Gpt',
      ctx: 200_000,
      out: 64_000,
      vision: false,
      combo: true,
      reasoning: 'None (9router Antigravity drops thinking)'
    }
  ]
}
const list = vi.fn(async (): Promise<Claude9ModelList> => models)

beforeEach(() => {
  list.mockClear()
  ;(window as unknown as { api: unknown }).api = { claude9: { list } }
  useAppStore.setState({
    settings: {
      ...getDefaultSettings('/tmp/test-home'),
      claudeManagedAccounts: []
    },
    fetchInactiveClaudeAccountUsage: vi.fn(async () => {})
  })
})
afterEach(cleanup)

describe('Deck account picker 9router row', () => {
  it('shows one 9router row, previews the default model and launches claude9', async () => {
    const launch = vi.fn()
    render(
      <DeckAgentAccountPicker
        agent="claude"
        local
        onLaunch={() => {}}
        onLaunchClaude9={launch}
        onClose={() => {}}
      />
    )
    const row = await screen.findByRole('button', { name: '9router (claude9)' })
    expect(row.textContent).toContain('ds')
    expect(screen.queryByRole('button', { name: /Gpt/ })).toBeNull()
    fireEvent.pointerEnter(row)
    const preview = screen.getByRole('complementary', { name: 'Account usage preview' })
    expect(preview.textContent).toContain('/model')
    expect(preview.textContent).toContain('Effort-scaled, can turn off')
    expect(preview.textContent).toContain('Gateway online')
    fireEvent.click(row)
    expect(launch).toHaveBeenCalledOnce()
  })

  it('shows why the gateway is unavailable and retries on demand', async () => {
    list.mockResolvedValueOnce({ available: false, reason: 'Gateway offline', fetchedAt: 1 })
    render(
      <DeckAgentAccountPicker
        agent="claude"
        local
        onLaunch={() => {}}
        onLaunchClaude9={() => {}}
        onClose={() => {}}
      />
    )
    expect(await screen.findByText('Gateway offline')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: '9router (claude9)' }) as HTMLButtonElement).disabled
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry 9router' }))
    expect(list).toHaveBeenLastCalledWith({ force: true })
    await screen.findByText('ds')
  })

  it('stays hidden for other agents and when no claude9 launch is wired', () => {
    render(<DeckAgentAccountPicker agent="codex" local onLaunch={() => {}} onClose={() => {}} />)
    cleanup()
    render(<DeckAgentAccountPicker agent="claude" local onLaunch={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: '9router (claude9)' })).toBeNull()
    expect(list).not.toHaveBeenCalled()
  })
})
