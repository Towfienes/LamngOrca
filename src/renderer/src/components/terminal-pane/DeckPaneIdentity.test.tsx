// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DeckPaneIdentity } from './DeckPaneIdentity'
import type {
  AgentProviderSessionMetadata,
  SleepingAgentSessionRecord
} from '../../../../shared/agent-session-resume'

const leafId = '00000000-0000-4000-8000-000000000001'
const paneKey = `tab:${leafId}`
const header = (): Element => document.querySelector('.deck-pane-identity')!
const expectAccount = (account: string): void => {
  expect(header().getAttribute('title')).toContain(account)
  expect(screen.queryByText(account)).toBeNull()
}
const fixture = vi.hoisted(() => {
  const providerSession: AgentProviderSessionMetadata = { key: 'session_id', id: 'session-one' }
  const sleepingAgentSessionsByPaneKey: Record<string, SleepingAgentSessionRecord> = {}
  const paneForegroundAgentByPaneKey: Record<
    string,
    { agent: string | null; shellForeground: boolean }
  > = {}
  return {
    state: {
      sleepingAgentSessionsByPaneKey,
      paneForegroundAgentByPaneKey,
      agentStatusByPaneKey: {
        'tab:00000000-0000-4000-8000-000000000001': {
          agentType: 'codex',
          lastAssistantMessage: '',
          model: '',
          reasoningEffort: '',
          providerSession
        }
      },
      agentLaunchConfigByPaneKey: {
        'tab:00000000-0000-4000-8000-000000000001': {
          launchConfig: { agentEnv: { ORCA_AGENT_LAUNCH_ACCOUNT_ID: 'b' } },
          identity: { agentType: 'codex' }
        }
      },
      terminalLayoutsByTabId: {
        tab: { ptyIdsByLeafId: { '00000000-0000-4000-8000-000000000001': 'pty-one' } }
      },
      settings: {
        claudeManagedAccounts: [
          { id: 'b', email: 'claude-b@example.invalid', managedAuthPath: '/managed/claude-b/auth' }
        ],
        activeCodexManagedAccountId: 'a',
        codexManagedAccounts: [
          { id: 'a', email: 'a@example.invalid' },
          { id: 'b', email: 'b@example.invalid' }
        ]
      }
    }
  }
})
vi.mock('@/store', () => ({
  useAppStore: (select: (s: typeof fixture.state) => unknown) => select(fixture.state)
}))
vi.mock('@/lib/agent-catalog', () => ({ AgentIcon: () => <span /> }))
beforeEach(() => {
  fixture.state.agentStatusByPaneKey[paneKey] = {
    agentType: 'codex',
    lastAssistantMessage: '',
    model: '',
    reasoningEffort: '',
    providerSession: { key: 'session_id', id: 'session-one' }
  }
  fixture.state.agentLaunchConfigByPaneKey[paneKey] = {
    launchConfig: { agentEnv: { ORCA_AGENT_LAUNCH_ACCOUNT_ID: 'b' } },
    identity: { agentType: 'codex' }
  }
  fixture.state.terminalLayoutsByTabId.tab.ptyIdsByLeafId[leafId] = 'pty-one'
  fixture.state.settings.claudeManagedAccounts = [
    { id: 'b', email: 'claude-b@example.invalid', managedAuthPath: '/managed/claude-b/auth' }
  ]
  for (const key of Object.keys(fixture.state.sleepingAgentSessionsByPaneKey)) {
    delete fixture.state.sleepingAgentSessionsByPaneKey[key]
  }
  for (const key of Object.keys(fixture.state.paneForegroundAgentByPaneKey)) {
    delete fixture.state.paneForegroundAgentByPaneKey[key]
  }
})
afterEach(cleanup)
describe('pane account identity', () => {
  it('shows its pinned account rather than the current global account', () => {
    render(<DeckPaneIdentity paneKey={paneKey} />)
    expectAccount('b@example.invalid')
    expect(header().getAttribute('title')).not.toContain('a@example.invalid')
  })
  it('keeps the account visible beside a custom pane title', () => {
    render(<DeckPaneIdentity paneKey={paneKey} title="Review parser" />)
    expectAccount('b@example.invalid')
  })
})

describe('account identity after prompt activity', () => {
  it('keeps the pinned account when a turn consumes the launch configuration', () => {
    const { rerender } = render(<DeckPaneIdentity paneKey={paneKey} />)
    Reflect.deleteProperty(fixture.state.agentLaunchConfigByPaneKey, paneKey)
    fixture.state.agentStatusByPaneKey[paneKey].lastAssistantMessage = 'Finished reviewing parser'
    rerender(<DeckPaneIdentity paneKey={paneKey} title="Review parser" />)
    expectAccount('b@example.invalid')
    expect(header().getAttribute('title')).toBeTruthy()
    expect(screen.getByText('Review parser')).toBeTruthy()
    expect(screen.queryByText('Finished reviewing parser')).toBeNull()
  })
  it('does not keep a previous account after the PTY changes', () => {
    const { rerender } = render(<DeckPaneIdentity paneKey={paneKey} />)
    Reflect.deleteProperty(fixture.state.agentLaunchConfigByPaneKey, paneKey)
    fixture.state.terminalLayoutsByTabId.tab.ptyIdsByLeafId[leafId] = 'pty-two'
    rerender(<DeckPaneIdentity paneKey={paneKey} />)
    expect(header().getAttribute('title')).not.toContain('b@example.invalid')
    expect(header().getAttribute('title')).toContain('Codex')
  })
  it('shows the replacement launch account instead of a cached previous account', () => {
    const { rerender } = render(<DeckPaneIdentity paneKey={paneKey} />)
    fixture.state.agentLaunchConfigByPaneKey[
      paneKey
    ].launchConfig.agentEnv.ORCA_AGENT_LAUNCH_ACCOUNT_ID = 'a'
    fixture.state.terminalLayoutsByTabId.tab.ptyIdsByLeafId[leafId] = 'pty-two'
    rerender(<DeckPaneIdentity paneKey={paneKey} />)
    expectAccount('a@example.invalid')
  })
  it('retains Claude account identity too', () => {
    fixture.state.agentStatusByPaneKey[paneKey].agentType = 'claude'
    fixture.state.agentLaunchConfigByPaneKey[paneKey].identity.agentType = 'claude'
    const { rerender } = render(<DeckPaneIdentity paneKey={paneKey} />)
    Reflect.deleteProperty(fixture.state.agentLaunchConfigByPaneKey, paneKey)
    rerender(<DeckPaneIdentity paneKey={paneKey} title="api-design, backend-patterns" />)
    expectAccount('claude-b@example.invalid')
    expect(header().getAttribute('title')).toContain('api-design, backend-patterns')
  })
  it('does not use the previous CLI account for a different agent', () => {
    const { rerender } = render(<DeckPaneIdentity paneKey={paneKey} />)
    Reflect.deleteProperty(fixture.state.agentLaunchConfigByPaneKey, paneKey)
    fixture.state.agentStatusByPaneKey[paneKey].agentType = 'claude'
    rerender(<DeckPaneIdentity paneKey={paneKey} />)
    expect(header().getAttribute('title')).not.toContain('claude-b@example.invalid')
    expect(header().getAttribute('title')).toContain('Claude')
  })
})

describe('current model in the header', () => {
  it('updates the model without losing the pinned account after launch metadata expires', () => {
    fixture.state.agentStatusByPaneKey[paneKey].model = 'gpt-6.1-sol'
    const { rerender } = render(<DeckPaneIdentity paneKey={paneKey} />)
    expect(header().getAttribute('title')).toContain('gpt-6.1-sol')
    Reflect.deleteProperty(fixture.state.agentLaunchConfigByPaneKey, paneKey)
    fixture.state.agentStatusByPaneKey[paneKey].model = 'gpt-6-astra'
    rerender(<DeckPaneIdentity paneKey={paneKey} />)
    expectAccount('b@example.invalid')
    expect(header().getAttribute('title')).toContain('gpt-6-astra')
    expect(screen.queryByText('gpt-6.1-sol')).toBeNull()
  })
  it('omits the model when it has not been reported', () => {
    const { container } = render(<DeckPaneIdentity paneKey={paneKey} />)
    expect(container.querySelector('[data-pane-model]')).toBeNull()
  })

  it('keeps a custom terminal title editable beside its model', () => {
    Reflect.deleteProperty(fixture.state.agentLaunchConfigByPaneKey, paneKey)
    fixture.state.agentStatusByPaneKey[paneKey].model = 'gpt-6-astra'
    const onEditTitle = vi.fn()
    render(<DeckPaneIdentity paneKey={paneKey} title="Review parser" onEditTitle={onEditTitle} />)
    const button = screen.getByRole('button', { name: 'Edit pane title: Review parser' })
    button.click()
    expect(onEditTitle).toHaveBeenCalledOnce()
    expect(button.style.lineHeight).toBe('1')
    expect(header().getAttribute('title')).toContain('gpt-6-astra')
  })
})

describe('restored pane identity', () => {
  it('recovers the account after a renderer remount consumes ephemeral launch metadata', () => {
    Reflect.deleteProperty(fixture.state.agentLaunchConfigByPaneKey, paneKey)
    fixture.state.sleepingAgentSessionsByPaneKey[paneKey] = {
      paneKey,
      tabId: 'tab',
      worktreeId: 'wt',
      agent: 'codex',
      providerSession: { key: 'session_id', id: 'session-one' },
      prompt: '',
      state: 'done',
      capturedAt: 10,
      updatedAt: 10,
      launchConfig: { agentArgs: '', agentEnv: { ORCA_AGENT_LAUNCH_ACCOUNT_ID: 'b' } }
    }
    render(<DeckPaneIdentity paneKey={paneKey} />)
    expectAccount('b@example.invalid')
  })

  it('shows a restored foreground Claude identity before the next hook arrives', () => {
    Reflect.deleteProperty(fixture.state.agentStatusByPaneKey, paneKey)
    Reflect.deleteProperty(fixture.state.agentLaunchConfigByPaneKey, paneKey)
    fixture.state.paneForegroundAgentByPaneKey[paneKey] = {
      agent: 'claude',
      shellForeground: false
    }
    render(<DeckPaneIdentity paneKey={paneKey} />)
    expect(header().getAttribute('title')).toContain('Claude')
    expect(screen.queryByText('Terminal')).toBeNull()
  })
})

it('shows only the editable title beside the logo, keeping identity metadata on hover', () => {
  fixture.state.agentStatusByPaneKey[paneKey].model = 'gpt-6.1-sol'
  fixture.state.agentStatusByPaneKey[paneKey].reasoningEffort = 'high'
  const title = 'A very long session title that must stay accessible on hover'
  const { container } = render(<DeckPaneIdentity paneKey={paneKey} title={title} />)
  const header = container.querySelector('.deck-pane-identity')
  expect(header?.textContent).toBe(title)
  expect(container.querySelector('[data-pane-account]')).toBeNull()
  expect(header?.getAttribute('title')).toContain('gpt-6.1-sol · high')
  expect(screen.getByRole('button').getAttribute('title')).toBe(title)
})

it('does not recover an account from a different provider session', () => {
  Reflect.deleteProperty(fixture.state.agentLaunchConfigByPaneKey, paneKey)
  fixture.state.sleepingAgentSessionsByPaneKey[paneKey] = {
    paneKey,
    worktreeId: 'wt',
    agent: 'codex',
    providerSession: { key: 'session_id', id: 'other' },
    prompt: '',
    state: 'done',
    capturedAt: 10,
    updatedAt: 10,
    launchConfig: { agentArgs: '', agentEnv: { ORCA_AGENT_LAUNCH_ACCOUNT_ID: 'b' } }
  }
  render(<DeckPaneIdentity paneKey={paneKey} />)
  expect(header().getAttribute('title')).not.toContain('b@example.invalid')
})

it('does not reuse old reasoning after the live model changes', () => {
  fixture.state.sleepingAgentSessionsByPaneKey[paneKey] = {
    paneKey,
    worktreeId: 'wt',
    agent: 'codex',
    providerSession: { key: 'session_id', id: 'session-one' },
    prompt: 'Review',
    state: 'done',
    capturedAt: 10,
    updatedAt: 10,
    model: 'gpt-old',
    reasoningEffort: 'high'
  }
  fixture.state.agentStatusByPaneKey[paneKey].model = 'gpt-new'
  const { container } = render(<DeckPaneIdentity paneKey={paneKey} title="Review" />)
  expect(container.querySelector('[data-pane-reasoning]')).toBeNull()
})

it('shows a session placeholder when there is no title yet', () => {
  render(<DeckPaneIdentity paneKey={paneKey} />)
  expectAccount('b@example.invalid')
  expect(screen.getByText('Session')).toBeTruthy()
})

it('shows an existing Claude session account from its reported transcript without launch metadata', () => {
  Reflect.deleteProperty(fixture.state.agentLaunchConfigByPaneKey, paneKey)
  fixture.state.agentStatusByPaneKey[paneKey].agentType = 'claude'
  fixture.state.agentStatusByPaneKey[paneKey].providerSession.transcriptPath =
    '/managed/claude-b/auth/projects/workspace/session-one.jsonl'
  render(<DeckPaneIdentity paneKey={paneKey} title="Continue the review" />)
  expectAccount('claude-b@example.invalid')
})

it.each([
  ['/managed/claude-b/auth/projects-extra/session.jsonl', 'pty-one'],
  ['/managed/claude-b/auth-other/projects/session.jsonl', 'pty-one'],
  ['/managed/claude-b/auth/projects/session.jsonl', 'ssh:host@@pty-one'],
  ['/managed/claude-b/auth/projects/session.jsonl', 'remote:host:term-one']
])('does not attribute an unrelated transcript or remote PTY: %s %s', (path, ptyId) => {
  Reflect.deleteProperty(fixture.state.agentLaunchConfigByPaneKey, paneKey)
  fixture.state.agentStatusByPaneKey[paneKey].agentType = 'claude'
  fixture.state.agentStatusByPaneKey[paneKey].providerSession.transcriptPath = path
  fixture.state.terminalLayoutsByTabId.tab.ptyIdsByLeafId[leafId] = ptyId
  render(<DeckPaneIdentity paneKey={paneKey} title="Review" />)
  expect(header().getAttribute('title')).not.toContain('claude-b@example.invalid')
})

it('uses the same Windows path matching as the rest of Orca', () => {
  Reflect.deleteProperty(fixture.state.agentLaunchConfigByPaneKey, paneKey)
  fixture.state.settings.claudeManagedAccounts[0]!.managedAuthPath = 'C:\\Orca\\Claude\\Auth'
  fixture.state.agentStatusByPaneKey[paneKey].agentType = 'claude'
  fixture.state.agentStatusByPaneKey[paneKey].providerSession.transcriptPath =
    'c:/orca/claude/auth/projects/workspace/session.jsonl'
  render(<DeckPaneIdentity paneKey={paneKey} title="Review" />)
  expectAccount('claude-b@example.invalid')
})

it('recovers a legacy Claude account when only the saved session transcript is available', () => {
  Reflect.deleteProperty(fixture.state.agentStatusByPaneKey, paneKey)
  Reflect.deleteProperty(fixture.state.agentLaunchConfigByPaneKey, paneKey)
  fixture.state.sleepingAgentSessionsByPaneKey[paneKey] = {
    paneKey,
    worktreeId: 'wt',
    agent: 'claude',
    ptyId: 'pty-one',
    providerSession: {
      key: 'session_id',
      id: 'saved',
      transcriptPath: '/managed/claude-b/auth/projects/workspace/saved.jsonl'
    },
    prompt: 'Saved review',
    state: 'done',
    capturedAt: 10,
    updatedAt: 10
  }
  render(<DeckPaneIdentity paneKey={paneKey} />)
  expectAccount('claude-b@example.invalid')
})

it('keeps a legacy Claude account after an idle provider update drops the transcript path', () => {
  Reflect.deleteProperty(fixture.state.agentLaunchConfigByPaneKey, paneKey)
  fixture.state.agentStatusByPaneKey[paneKey].agentType = 'claude'
  fixture.state.agentStatusByPaneKey[paneKey].providerSession.transcriptPath =
    '/managed/claude-b/auth/projects/workspace/session-one.jsonl'
  const { rerender } = render(<DeckPaneIdentity paneKey={paneKey} title="Saved review" />)
  expectAccount('claude-b@example.invalid')
  Reflect.deleteProperty(
    fixture.state.agentStatusByPaneKey[paneKey].providerSession,
    'transcriptPath'
  )
  rerender(<DeckPaneIdentity paneKey={paneKey} title="Saved review" />)
  expectAccount('claude-b@example.invalid')
  expect(screen.getByText('Saved review')).toBeTruthy()
})

it('uses the saved terminal title when a resumed session has no prompt yet', () => {
  fixture.state.sleepingAgentSessionsByPaneKey[paneKey] = {
    paneKey,
    worktreeId: 'wt',
    agent: 'codex',
    ptyId: 'pty-one',
    providerSession: { key: 'session_id', id: 'session-one' },
    prompt: '',
    terminalTitle: 'Yesterday review',
    state: 'done',
    capturedAt: 10,
    updatedAt: 10
  }
  render(<DeckPaneIdentity paneKey={paneKey} />)
  expectAccount('b@example.invalid')
  expect(screen.getByText('Yesterday review')).toBeTruthy()
})
