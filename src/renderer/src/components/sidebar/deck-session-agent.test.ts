import { expect, it } from 'vitest'
import { getDeckSessionAgents, getDeckSessionLaunchAgent } from './deck-session-agent'

it('shows both OpenCode versions while keeping other histories separate', () => {
  expect(getDeckSessionAgents('opencode')).toEqual(['opencode', 'opencode2'])
  expect(getDeckSessionAgents('opencode2')).toEqual(['opencode2'])
  expect(getDeckSessionAgents('claude-agent-teams')).toEqual(['claude'])
  expect(getDeckSessionAgents('dsh')).toEqual(['dsh'])
})
it('resumes OpenCode 2 with its own agent and preserves unrelated validation', () => {
  expect(getDeckSessionLaunchAgent('opencode', { agent: 'opencode2' })).toBe('opencode2')
  expect(getDeckSessionLaunchAgent('opencode', undefined)).toBe('opencode')
  expect(getDeckSessionLaunchAgent('codex', { agent: 'opencode2' })).toBe('codex')
  expect(getDeckSessionLaunchAgent('claude-agent-teams', { agent: 'claude' })).toBe(
    'claude-agent-teams'
  )
})
