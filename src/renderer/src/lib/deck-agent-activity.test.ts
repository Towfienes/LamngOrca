import { describe, expect, it } from 'vitest'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import {
  selectAgentAttention,
  selectRunningAgentsKey,
  summarizeTabAgents
} from './deck-agent-activity'

const L1 = '11111111-1111-4111-8111-111111111111'
const L2 = '22222222-2222-4222-8222-222222222222'

const entry = (
  paneKey: string,
  agentType: string,
  state: AgentStatusEntry['state'],
  restoredUnconfirmed?: true
): AgentStatusEntry => ({
  paneKey,
  agentType,
  state,
  prompt: '',
  updatedAt: 1,
  stateStartedAt: 1,
  stateHistory: [],
  ...(restoredUnconfirmed ? { restoredUnconfirmed } : {})
})

const status = Object.fromEntries(
  [
    entry(`tab-a:${L1}`, 'claude', 'working'),
    entry(`tab-a:${L2}`, 'codex', 'done'),
    entry(`tab-b:${L1}`, 'codex', 'blocked'),
    entry(`tab-c:${L1}`, 'antigravity', 'working', true),
    entry(`tab-z:${L1}`, 'claude', 'working')
  ].map((item) => [item.paneKey, item])
)

describe('deck agent activity', () => {
  it('lists live agent types for the given tabs only', () => {
    expect(selectRunningAgentsKey(status, new Set(['tab-a', 'tab-b', 'tab-c']))).toBe(
      'claude,codex'
    )
    expect(selectRunningAgentsKey(status, new Set(['tab-c']))).toBe('')
  })

  it('ranks waiting above running and ignores done or unconfirmed rows', () => {
    expect(selectAgentAttention(status, new Set(['tab-a']))).toBe('running')
    expect(selectAgentAttention(status, new Set(['tab-a', 'tab-b']))).toBe('waiting')
    expect(selectAgentAttention(status, new Set(['tab-c']))).toBeNull()
  })
})

it('summarizes every tab in one pass: live agent icon wins, waiting outranks running', () => {
  const byTab = summarizeTabAgents(status)
  expect(byTab.get('tab-a')).toEqual({ agent: 'claude', attention: 'running' })
  expect(byTab.get('tab-b')).toEqual({ agent: 'codex', attention: 'waiting' })
  // Restored rows are not live but still name the agent for the icon.
  expect(byTab.get('tab-c')).toEqual({ agent: 'antigravity', attention: null })
})
