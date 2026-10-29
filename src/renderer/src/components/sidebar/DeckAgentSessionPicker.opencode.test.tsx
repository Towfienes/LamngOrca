// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AiVaultSession } from '../../../../shared/ai-vault-types'
import { DeckAgentSessionPicker } from './DeckAgentSessionPicker'

vi.mock('@/lib/agent-catalog', () => ({
  AgentIcon: () => null,
  getAgentLabel: (agent: string) => agent
}))
vi.mock('@/store', () => ({ useAppStore: { getState: () => ({}) } }))
vi.mock('@/lib/ai-vault-resume-target', () => ({
  getAiVaultResumeWorkspaceExecutionHostId: () => 'local'
}))
vi.mock('../right-sidebar/ai-vault-session-launch-target', () => ({
  resolveAiVaultTargetWorkspacePath: () => '/workspace'
}))
const list = vi.fn()
const cancel = vi.fn(async () => {})

function session(index: number, overrides: Partial<AiVaultSession> = {}): AiVaultSession {
  return {
    id: `opencode-${index}`,
    agent: 'opencode',
    sessionId: `session-${index}`,
    executionHostId: 'local',
    title: `Session ${index}`,
    cwd: '/workspace',
    branch: 'main',
    model: 'reported-model',
    filePath: '/sessions/opencode.db',
    codexHome: null,
    createdAt: null,
    updatedAt: null,
    modifiedAt: new Date(Date.UTC(2026, 9, 22, 0, 0, 59) - index * 1000).toISOString(),
    messageCount: 2,
    totalTokens: 0,
    previewMessages: [],
    queuedMessageCount: 0,
    subagentTranscriptCount: 0,
    resumeCommand: `opencode --session session-${index}`,
    subagent: null,
    ...overrides
  }
}
function mount(onLaunch = vi.fn(async (_session?: AiVaultSession) => {})) {
  const view = render(
    <DeckAgentSessionPicker
      agent="opencode"
      worktreeId="wt"
      accountLabel="Workspace default account"
      onBack={vi.fn()}
      onLaunch={onLaunch}
    />
  )
  return { ...view, onLaunch }
}
beforeEach(() => {
  list.mockReset().mockResolvedValue({ sessions: [], issues: [], scannedAt: '' })
  cancel.mockClear()
  Object.defineProperty(window, 'api', {
    configurable: true,
    value: { aiVault: { listSessions: list, cancelListSessions: cancel } }
  })
})
afterEach(cleanup)

it('starts with a smaller history request and shows only twenty rows per page', async () => {
  list.mockResolvedValue({
    sessions: Array.from({ length: 45 }, (_, index) => session(index)),
    issues: [],
    scannedAt: ''
  })
  mount()
  await screen.findByText('Session 0')
  expect(list).toHaveBeenCalledWith(
    expect.objectContaining({ limit: 250, scopePaths: ['/workspace'], executionHostScope: 'local' })
  )
  expect(screen.getAllByRole('option')).toHaveLength(20)
  expect(screen.getByText('1–20 of 45')).toBeTruthy()
  expect(screen.queryByText('Workspace default account')).toBeNull()
})

it('paginates locally, resets the page on search, and Enter resumes the matching result', async () => {
  const sessions = Array.from({ length: 45 }, (_, index) => session(index))
  list.mockResolvedValue({ sessions, issues: [], scannedAt: '' })
  const { onLaunch } = mount()
  await screen.findByText('Session 0')
  fireEvent.click(screen.getByRole('button', { name: 'Next sessions' }))
  expect(screen.getByText('Session 20')).toBeTruthy()
  fireEvent.change(screen.getByRole('combobox', { name: 'Search sessions' }), {
    target: { value: 'Session 44' }
  })
  await screen.findByText('Session 44')
  await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1))
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' })
  await waitFor(() => expect(onLaunch).toHaveBeenCalledWith(sessions[44]))
  expect(list).toHaveBeenCalledTimes(1)
})

it('keeps foreign-host and other-agent sessions out while switching workspace scope', async () => {
  list.mockResolvedValue({
    sessions: [
      session(0),
      session(1, { cwd: '/other', agent: 'opencode2' }),
      session(2, { agent: 'kiro' }),
      session(3, { executionHostId: 'ssh:other' })
    ],
    issues: [],
    scannedAt: ''
  })
  mount()
  await screen.findByText('Session 0')
  expect(screen.queryByText('Session 1')).toBeNull()
  fireEvent.click(screen.getByRole('radio', { name: 'All sessions' }))
  expect(await screen.findByText('Session 1')).toBeTruthy()
  expect(screen.queryByText('Session 2')).toBeNull()
  expect(screen.queryByText('Session 3')).toBeNull()
  expect(list).toHaveBeenCalledTimes(1)
})

it('keeps New session available while loading and guards duplicate launches', async () => {
  list.mockImplementation(() => new Promise(() => {}))
  const launch = vi.fn(() => new Promise<void>(() => {}))
  mount(launch)
  const button = screen.getByRole('button', { name: 'New session' })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(launch).toHaveBeenCalledTimes(1)
  expect(button).toHaveProperty('disabled', true)
})

it('reports failures and retries only on an explicit refresh', async () => {
  list.mockRejectedValueOnce(new Error('History unavailable'))
  mount()
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'History unavailable')
  list.mockResolvedValue({ sessions: [session(0)], issues: [], scannedAt: '' })
  fireEvent.click(screen.getByRole('button', { name: 'Refresh sessions' }))
  expect(await screen.findByText('Session 0')).toBeTruthy()
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ force: true }))
})

it('can load older sessions even when the scan includes duplicate rows', async () => {
  list.mockResolvedValue({
    sessions: Array.from({ length: 250 }, () => session(0)),
    issues: [],
    scannedAt: ''
  })
  mount()
  await screen.findByText('Session 0')
  fireEvent.click(screen.getByRole('button', { name: 'Load older sessions' }))
  await waitFor(() =>
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 500 }))
  )
})
