import { expect, it } from 'vitest'
import { createTestStore, makeTab } from './store-test-helpers'

it('preserves account, title and PTY through repeated idle provider heartbeats', () => {
  const store = createTestStore()
  const leaf = '11111111-1111-4111-8111-111111111111'
  const paneKey = `tab-1:${leaf}`
  const providerSession = {
    key: 'session_id' as const,
    id: 'claude-session',
    transcriptPath: '/managed/auth/projects/wt/session.jsonl'
  }
  store.setState({
    tabsByWorktree: { wt: [makeTab({ id: 'tab-1', worktreeId: 'wt' })] },
    terminalLayoutsByTabId: {
      'tab-1': {
        root: { type: 'leaf', leafId: leaf },
        activeLeafId: leaf,
        expandedLeafId: null,
        ptyIdsByLeafId: { [leaf]: 'pty-one' }
      }
    }
  })
  store
    .getState()
    .registerAgentLaunchConfig(
      paneKey,
      { agentArgs: '', agentEnv: { ORCA_AGENT_LAUNCH_ACCOUNT_ID: 'chosen' } },
      { agentType: 'claude', providerSession }
    )
  store
    .getState()
    .setAgentStatus(
      paneKey,
      {
        state: 'working',
        agentType: 'claude',
        prompt: 'Review yesterday changes',
        model: 'claude-sonnet-4-6',
        reasoningEffort: 'high'
      },
      'Review yesterday changes',
      { updatedAt: 10 },
      { worktreeId: 'wt', tabId: 'tab-1' },
      { providerSession }
    )
  for (const updatedAt of [20, 30]) {
    store
      .getState()
      .recordAgentProviderSession(
        paneKey,
        'claude',
        { key: 'session_id', id: 'claude-session' },
        { updatedAt },
        { worktreeId: 'wt', tabId: 'tab-1' }
      )
    expect(store.getState().sleepingAgentSessionsByPaneKey[paneKey]).toMatchObject({
      prompt: 'Review yesterday changes',
      model: 'claude-sonnet-4-6',
      reasoningEffort: 'high',
      ptyId: 'pty-one',
      providerSession,
      launchConfig: { agentEnv: { ORCA_AGENT_LAUNCH_ACCOUNT_ID: 'chosen' } }
    })
  }
  store
    .getState()
    .recordAgentProviderSession(
      paneKey,
      'claude',
      { key: 'session_id', id: 'other-session' },
      { updatedAt: 40 },
      { worktreeId: 'wt', tabId: 'tab-1' }
    )
  expect(store.getState().sleepingAgentSessionsByPaneKey[paneKey]?.prompt).toBe('')
  expect(store.getState().sleepingAgentSessionsByPaneKey[paneKey]?.model).toBeUndefined()
  expect(store.getState().sleepingAgentSessionsByPaneKey[paneKey]?.launchConfig).toBeUndefined()
})
