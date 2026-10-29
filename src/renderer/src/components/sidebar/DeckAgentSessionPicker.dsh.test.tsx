// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { DeckAgentSessionPicker } from './DeckAgentSessionPicker'

vi.mock('@/lib/agent-catalog', () => ({
  AgentIcon: () => <span />,
  getAgentLabel: (a: string) => a
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('@/lib/ai-vault-resume-target', () => ({
  getAiVaultResumeWorkspaceExecutionHostId: () => 'local'
}))
vi.mock('../right-sidebar/ai-vault-session-launch-target', () => ({
  resolveAiVaultTargetWorkspacePath: () => '/workspace'
}))
vi.mock('../ui/command', () => ({
  Command: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandInput: ({
    value,
    onValueChange,
    ...props
  }: {
    value: string
    onValueChange: (v: string) => void
  }) => <input {...props} value={value} onChange={(e) => onValueChange(e.target.value)} />,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandItem: ({
    children,
    onSelect,
    disabled
  }: {
    children: React.ReactNode
    onSelect: () => void
    disabled?: boolean
  }) => (
    <button disabled={disabled} onClick={onSelect}>
      {children}
    </button>
  )
}))

const workspacePath = '/workspace'
const dshSession: AiVaultSession = {
  id: 'dsh-session',
  agent: 'dsh',
  sessionId: 'dsh-session',
  executionHostId: 'local',
  title: 'Dsh picker smoke',
  cwd: workspacePath,
  branch: null,
  model: null,
  filePath: `${workspacePath}/.dsh/sessions/-workspace/dsh-session/session.v1.jsonl`,
  codexHome: null,
  createdAt: null,
  updatedAt: null,
  modifiedAt: '2026-10-22T00:00:00Z',
  messageCount: 2,
  totalTokens: 0,
  previewMessages: [
    { role: 'user', text: 'Pick me', timestamp: null },
    { role: 'assistant', text: 'Picked', timestamp: null }
  ],
  queuedMessageCount: 0,
  subagentTranscriptCount: 0,
  resumeCommand: `cd '${workspacePath}' && dsh-tui --resume 'dsh-session'`,
  subagent: null
}

const list = vi.fn()
const cancel = vi.fn(async () => {})

beforeEach(() => {
  list.mockReset()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { aiVault: { listSessions: list, cancelListSessions: cancel } }
  })
  vi.stubGlobal('crypto', { randomUUID: () => 'request-1' })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('Deck session picker for DeepSeek Harness', () => {
  it('hides subagents before search, workspace scope and pagination', async () => {
    list.mockResolvedValue({
      sessions: [
        ...Array.from({ length: 45 }, (_, index) => ({
          ...dshSession,
          id: `child-${index}`,
          sessionId: `child-${index}`,
          title: 'ENVIRONMENT child',
          isSubagent: true
        })),
        {
          ...dshSession,
          id: 'known-child',
          sessionId: 'known-child',
          title: 'Known child',
          subagent: { parentSessionId: 'lead', agentType: null, status: null }
        },
        { ...dshSession, isSubagent: false },
        { ...dshSession, id: 'other', sessionId: 'other', cwd: '/other', title: 'Other lead' }
      ],
      issues: [],
      scannedAt: ''
    })
    render(
      <DeckAgentSessionPicker
        agent="dsh"
        worktreeId="wt"
        accountLabel=""
        onBack={() => {}}
        onLaunch={async () => {}}
      />
    )
    await screen.findByText('Dsh picker smoke', { selector: '[title]' })
    expect(screen.queryByText('ENVIRONMENT child')).toBeNull()
    expect(screen.queryByText('Known child')).toBeNull()
    expect(screen.getByText('1–1 of 1')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'View all sessions' }))
    expect(await screen.findByText('Other lead', { selector: '[title]' })).toBeTruthy()
    expect(screen.getByText('1–2 of 2')).toBeTruthy()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search sessions' }), {
      target: { value: 'ENVIRONMENT' }
    })
    expect(await screen.findByText(/No matching sessions/)).toBeTruthy()
  })

  it('renders a dsh session instead of the no-resumable-history notice', async () => {
    list.mockResolvedValue({ sessions: [dshSession], issues: [], scannedAt: '' })
    render(
      <DeckAgentSessionPicker
        agent="dsh"
        worktreeId="wt"
        accountLabel="b"
        onBack={() => {}}
        onLaunch={async () => {}}
      />
    )
    expect(await screen.findByText('Dsh picker smoke', { selector: '[title]' })).toBeTruthy()
    expect(screen.queryByText(/does not expose resumable history yet/)).toBeNull()
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ scopePaths: [workspacePath], executionHostScope: 'local' })
    )
  })

  it('offers a close button instead of an account step', async () => {
    list.mockResolvedValue({ sessions: [dshSession], issues: [], scannedAt: '' })
    render(
      <DeckAgentSessionPicker
        agent="dsh"
        worktreeId="wt"
        accountLabel="Workspace default account"
        onBack={() => {}}
        onLaunch={async () => {}}
      />
    )
    await screen.findByText('Dsh picker smoke', { selector: '[title]' })
    expect(screen.getByRole('button', { name: 'Close sessions' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back to accounts' })).toBeNull()
    expect(screen.queryByText('Workspace default account')).toBeNull()
  })

  it('passes the picked dsh session to onLaunch', async () => {
    list.mockResolvedValue({ sessions: [dshSession], issues: [], scannedAt: '' })
    const launch = vi.fn(async () => {})
    render(
      <DeckAgentSessionPicker
        agent="dsh"
        worktreeId="wt"
        accountLabel="b"
        onBack={() => {}}
        onLaunch={launch}
      />
    )
    fireEvent.click(
      (await screen.findByText('Dsh picker smoke', { selector: '[title]' })).closest('button')!
    )
    expect(launch).toHaveBeenCalledWith(dshSession)
  })

  it('shows the empty-list copy for dsh, not the unsupported-history notice', async () => {
    list.mockResolvedValue({ sessions: [], issues: [], scannedAt: '' })
    render(
      <DeckAgentSessionPicker
        agent="dsh"
        worktreeId="wt"
        accountLabel="b"
        onBack={() => {}}
        onLaunch={async () => {}}
      />
    )
    expect(await screen.findByText(/No sessions here/)).toBeTruthy()
    expect(screen.queryByText(/does not expose resumable history yet/)).toBeNull()
  })
})
