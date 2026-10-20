import { describe, expect, it } from 'vitest'
import { normalizeHookPayload } from '../../agent-hook-listener'
import { createHookListenerState, seedLegacyAgentStatusForTests } from '../listener-state'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const PANE = 'claude-model:11111111-1111-4111-8111-111111111111'

function session() {
  const state = createHookListenerState()
  const post = (hookEventName: string, fields: Record<string, unknown> = {}) => {
    const event = normalizeHookPayload(
      state,
      'claude',
      {
        paneKey: PANE,
        payload: { hook_event_name: hookEventName, session_id: 'session-a', ...fields }
      },
      'production'
    )
    if (event) {
      seedLegacyAgentStatusForTests(state, event)
    }
    return event
  }
  post('SessionStart', { source: 'startup', model: 'claude-sonnet-4-6' })
  return { state, post }
}

describe('Claude pane model status', () => {
  it('retains the reported root model across prompts, child tools and completion', () => {
    const { state, post } = session()
    expect(state.lastStatusByPaneKey.get(PANE)?.payload.model).toBe('claude-sonnet-4-6')
    expect(post('UserPromptSubmit', { prompt: 'Review the API' })?.payload.model).toBe(
      'claude-sonnet-4-6'
    )
    expect(
      post('PreToolUse', { agent_id: 'child-a', model: 'claude-haiku-4-5', tool_name: 'Read' })
        ?.payload.model
    ).toBe('claude-sonnet-4-6')
    expect(post('Stop')?.payload.model).toBe('claude-sonnet-4-6')
  })

  it.each(['working', 'waiting', 'done'] as const)(
    'updates the model while preserving the %s state and its prompt',
    (status) => {
      const { post } = session()
      post('UserPromptSubmit', { prompt: 'Review the API' })
      if (status === 'waiting') {
        post('PermissionRequest', { tool_name: 'Bash' })
      } else if (status === 'done') {
        post('Stop')
      }
      const switched = post('PostModelSwitch', { to_model: 'claude-opus-4-6' })
      expect(switched?.payload).toMatchObject({
        state: status,
        prompt: 'Review the API',
        model: 'claude-opus-4-6'
      })
      expect(switched?.payload.sessionBoundary).toBe(status === 'done' ? true : undefined)
      expect(post('Stop')?.payload.model).toBe('claude-opus-4-6')
    }
  )

  it('rejects model switches from a child or a different session', () => {
    const { state, post } = session()
    expect(post('PostModelSwitch', { agent_id: 'child-a', to_model: 'child-model' })).toBeNull()
    expect(
      post('PostModelSwitch', { session_id: 'session-b', to_model: 'foreign-model' })
    ).toBeNull()
    expect(post('PostModelSwitch', { to_model: { id: 'invalid' } })).toBeNull()
    expect(state.lastStatusByPaneKey.get(PANE)?.payload.model).toBe('claude-sonnet-4-6')
  })

  it('does not inherit a model from a replaced session', () => {
    const { post } = session()
    expect(
      post('SessionStart', { source: 'clear', session_id: 'session-b' })?.payload.model
    ).toBeUndefined()
  })
})

it('clears the previous reasoning setting when switching models without a reported effort', () => {
  const { post } = session()
  expect(
    post('PreToolUse', { tool_name: 'Read', effort: { level: 'high' } })?.payload.reasoningEffort
  ).toBe('high')
  expect(
    post('PostModelSwitch', { to_model: 'claude-opus-4-6' })?.payload.reasoningEffort
  ).toBeUndefined()
})

it('reads the live effort object from root tools and keeps child effort separate', () => {
  const { post } = session()
  expect(
    post('PreToolUse', { tool_name: 'Read', effort: { level: 'high' } })?.payload.reasoningEffort
  ).toBe('high')
  expect(
    post('PostToolUse', { tool_name: 'Read', agent_id: 'child-a', effort: { level: 'low' } })
      ?.payload.reasoningEffort
  ).toBe('high')
  expect(post('Stop', { effort: { level: 'medium' } })?.payload.reasoningEffort).toBe('medium')
})

it('recovers an actual root response model when an older session missed SessionStart', () => {
  const dir = mkdtempSync(join(tmpdir(), 'claude-root-model-'))
  const transcript = join(dir, 'session.jsonl')
  try {
    writeFileSync(
      transcript,
      [
        {
          type: 'assistant',
          message: { role: 'assistant', model: 'claude-sonnet-5-5', content: [] }
        },
        { type: 'user', message: { content: 'A prompt mentioning gpt-fake' } },
        { type: 'system', model: 'untrusted-model' }
      ]
        .map((entry) => JSON.stringify(entry))
        .concat('')
        .join('\n')
    )
    const state = createHookListenerState()
    const post = (fields: Record<string, unknown>) =>
      normalizeHookPayload(
        state,
        'claude',
        {
          paneKey: PANE,
          payload: {
            hook_event_name: 'PostToolUse',
            session_id: 'session-a',
            tool_name: 'Read',
            transcript_path: transcript,
            effort: { level: 'high' },
            ...fields
          }
        },
        'production'
      )
    expect(post({})?.payload).toMatchObject({
      model: 'claude-sonnet-5-5',
      reasoningEffort: 'high',
      state: 'working'
    })
    expect(post({ agent_id: 'child-a' })?.payload.model).toBeUndefined()
    expect(post({ transcript_path: join(dir, 'missing.jsonl') })?.payload.model).toBeUndefined()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
