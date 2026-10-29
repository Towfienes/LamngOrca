// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
  CommandList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CommandGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
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
const session = (
  id: string,
  agent: AiVaultSession['agent'],
  cwd = '/workspace'
): AiVaultSession => ({
  id,
  agent,
  cwd,
  sessionId: id,
  executionHostId: 'local',
  title: id,
  filePath: `/sessions/${id}.jsonl`,
  codexHome: null,
  branch: null,
  model: null,
  createdAt: null,
  updatedAt: null,
  modifiedAt: '2026-10-14T00:00:00Z',
  messageCount: 2,
  totalTokens: 0,
  previewMessages: [],
  queuedMessageCount: 0,
  subagentTranscriptCount: 0,
  resumeCommand: '',
  subagent: null
})
const list = vi.fn()
const cancel = vi.fn(async () => {})
beforeEach(() => {
  list.mockReset().mockResolvedValue({
    sessions: [
      session('codex-here', 'codex'),
      session('claude-here', 'claude'),
      session('codex-other', 'codex', '/other')
    ],
    issues: [],
    scannedAt: ''
  })
  vi.stubGlobal('crypto', { randomUUID: () => 'request-1' })
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { aiVault: { listSessions: list, cancelListSessions: cancel } }
  })
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
describe('Deck session history picker', () => {
  it('shows only the chosen agent and workspace, with all sessions available without another scan', async () => {
    render(
      <DeckAgentSessionPicker
        agent="codex"
        worktreeId="wt"
        accountLabel="b"
        onBack={() => {}}
        onLaunch={async () => {}}
      />
    )
    await screen.findByText('codex-here', { selector: '[title]' })
    expect(screen.queryByText('claude-here')).toBeNull()
    expect(screen.queryByText('codex-other')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'View all sessions' }))
    await screen.findByText('codex-other', { selector: '[title]' })
    expect(list).toHaveBeenCalledOnce()
    fireEvent.change(screen.getByRole('textbox', { name: 'Search sessions' }), {
      target: { value: 'other' }
    })
    await waitFor(() =>
      expect(screen.queryByText('codex-here', { selector: '[title]' })).toBeNull()
    )
  })
  it('opens new and existing sessions only after explicit selection', async () => {
    const launch = vi.fn(async () => {})
    render(
      <DeckAgentSessionPicker
        agent="codex"
        worktreeId="wt"
        accountLabel="b"
        onBack={() => {}}
        onLaunch={launch}
      />
    )
    fireEvent.click(
      (await screen.findByText('codex-here', { selector: '[title]' })).closest('button')!
    )
    expect(launch).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'codex-here' }))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'New session' }).hasAttribute('disabled')).toBe(
        false
      )
    )
    fireEvent.click(screen.getByRole('button', { name: 'New session' }))
    expect(launch).toHaveBeenLastCalledWith(undefined)
  })
  it('keeps launch errors visible and allows retry', async () => {
    const launch = vi.fn().mockRejectedValue(new Error('Transcript unavailable'))
    render(
      <DeckAgentSessionPicker
        agent="codex"
        worktreeId="wt"
        accountLabel="b"
        onBack={() => {}}
        onLaunch={launch}
      />
    )
    fireEvent.click(
      (await screen.findByText('codex-here', { selector: '[title]' })).closest('button')!
    )
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Transcript unavailable')
    fireEvent.click(screen.getByText('codex-here', { selector: '[title]' }).closest('button')!)
    await waitFor(() => expect(launch).toHaveBeenCalledTimes(2))
  })
  it('offers a new session when history loading fails', async () => {
    list.mockRejectedValue(new Error('Host unavailable'))
    render(
      <DeckAgentSessionPicker
        agent="codex"
        worktreeId="wt"
        accountLabel="b"
        onBack={() => {}}
        onLaunch={async () => {}}
      />
    )
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Host unavailable')
    expect(screen.getByRole('button', { name: 'New session' })).toBeTruthy()
  })
})
