import { describe, expect, it } from 'vitest'
import { normalizeAgentStatusEvent } from './normalize-agent-status-event'

describe('normalizeAgentStatusEvent', () => {
  it('preserves tool-output provenance for native chat gating', () => {
    const normalized = normalizeAgentStatusEvent({
      paneKey: 'tab-1:1',
      state: 'working',
      prompt: 'inspect the failure',
      agentType: 'claude',
      lastAssistantMessage: 'Exit code 1\nraw output',
      lastAssistantMessageIsToolOutput: true,
      connectionId: null,
      receivedAt: 1,
      stateStartedAt: 1
    })

    expect(normalized?.lastAssistantMessageIsToolOutput).toBe(true)
  })
})

describe('host model metadata reaching the renderer', () => {
  it('preserves reasoning effort across the IPC boundary', () => {
    expect(
      normalizeAgentStatusEvent({
        paneKey: 'pane',
        connectionId: null,
        receivedAt: 1,
        stateStartedAt: 1,
        state: 'working',
        prompt: 'Review',
        agentType: 'codex',
        model: 'gpt-6.1-sol',
        reasoningEffort: 'high'
      })
    ).toMatchObject({ model: 'gpt-6.1-sol', reasoningEffort: 'high' })
  })
  it('accepts an older host without reasoning metadata', () => {
    expect(
      normalizeAgentStatusEvent({
        paneKey: 'pane',
        connectionId: null,
        receivedAt: 1,
        stateStartedAt: 1,
        state: 'done',
        prompt: 'Review',
        agentType: 'claude',
        model: 'claude-sonnet-5-5'
      })
    ).toMatchObject({ model: 'claude-sonnet-5-5', state: 'done' })
  })
})
