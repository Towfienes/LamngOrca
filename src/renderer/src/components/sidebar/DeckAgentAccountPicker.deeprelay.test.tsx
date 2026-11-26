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
  fetchedAt: 1,
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
  Object.assign(window, { api: { deeprelay: { list } } })
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
  it('shows the configured default model and launches DeepRelay', async () => {
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
    fireEvent.click(row)
    expect(launch).toHaveBeenCalledOnce()
  })

  it('disables its row when DeepRelay is unavailable', async () => {
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
    const row = await screen.findByRole('button', { name: 'DeepRelay (claude-dl)' })
    expect(row.hasAttribute('disabled')).toBe(true)
  })
})
