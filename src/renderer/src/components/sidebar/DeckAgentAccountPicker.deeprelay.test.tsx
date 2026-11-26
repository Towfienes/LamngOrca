// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import { useAppStore } from '@/store'
import { DeckAgentAccountPicker } from './DeckAgentAccountPicker'
import type { DeeprelayModelList } from '../../../../shared/deeprelay-models'

vi.mock('@/lib/agent-catalog', () => ({
  AgentIcon: () => <span />,
  getAgentLabel: (agent: string) => agent
}))

const models: DeeprelayModelList = {
  available: true,
  defaultId: 'deeprelay/deepseek-v4.1-flash',
  base: 'https://api.deeprelay.ai',
  fetchedAt: Date.now(),
  models: [
    {
      id: 'deeprelay/deepseek-v4.1-flash',
      label: 'deepseek-v4.1-flash',
      ctx: 1_048_576,
      out: 393_216,
      vision: true
    },
    { id: 'deeprelay/glm-5.3', label: 'glm-5.3', ctx: 1_048_576, out: 131_072, vision: false }
  ]
}
const list = vi.fn(async (): Promise<DeeprelayModelList> => models)

beforeEach(() => {
  list.mockClear()
  ;(window as unknown as { api: unknown }).api = { deeprelay: { list } }
  useAppStore.setState({
    settings: {
      ...getDefaultSettings('/tmp/test-home'),
      claudeManagedAccounts: []
    },
    fetchInactiveClaudeAccountUsage: vi.fn(async () => {})
  })
})
afterEach(cleanup)

describe('Deck account picker DeepRelay row', () => {
  it('shows one DeepRelay row, previews its default model and launches it', async () => {
    const launch = vi.fn()
    render(
      <DeckAgentAccountPicker
        agent="claude"
        local
        onLaunch={() => {}}
        onLaunchDeeprelay={launch}
        onClose={() => {}}
      />
    )
    const row = await screen.findByRole('button', { name: 'DeepRelay (claude-dl)' })
    expect(row.textContent).toContain('deepseek-v4.1-flash')
    expect(screen.queryByRole('button', { name: /glm-5.3/ })).toBeNull()
    fireEvent.pointerEnter(row)
    const preview = screen.getByRole('complementary', { name: 'Account usage preview' })
    expect(preview.textContent).toContain('/model')
    expect(preview.textContent).toContain('~/.claude-deeprelay')
    fireEvent.click(row)
    expect(launch).toHaveBeenCalledOnce()
  })

  it('shows why it is unavailable and retries on demand', async () => {
    list.mockResolvedValueOnce({
      available: false,
      reason: 'DeepRelay is not configured',
      fetchedAt: 1
    })
    render(
      <DeckAgentAccountPicker
        agent="claude"
        local
        onLaunch={() => {}}
        onLaunchDeeprelay={() => {}}
        onClose={() => {}}
      />
    )
    expect(await screen.findByText('DeepRelay is not configured')).toBeTruthy()
    expect(
      (screen.getByRole('button', { name: 'DeepRelay (claude-dl)' }) as HTMLButtonElement).disabled
    ).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Retry DeepRelay' }))
    await screen.findByText('deepseek-v4.1-flash')
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('stays hidden for other agents and when no DeepRelay launch is wired', () => {
    render(<DeckAgentAccountPicker agent="codex" local onLaunch={() => {}} onClose={() => {}} />)
    cleanup()
    render(<DeckAgentAccountPicker agent="claude" local onLaunch={() => {}} onClose={() => {}} />)
    expect(screen.queryByRole('button', { name: 'DeepRelay (claude-dl)' })).toBeNull()
    expect(list).not.toHaveBeenCalled()
  })
})
