import { describe, expect, it, vi } from 'vitest'
import {
  aiVaultSessionTitleKey,
  type AiVaultSessionTitlesResult
} from '../../../shared/ai-vault-session-title'
import { resolveTerminalTabTitle } from '../../../shared/tab-title-resolution'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import {
  collectAiVaultTitleRequests,
  type AiVaultTitleRequest
} from './ai-vault-tab-title-requests'
import {
  batchAiVaultTitleRequests,
  settleAiVaultTitleRequestBatches
} from './ai-vault-tab-title-batches'
import { startAiVaultTabTitleSync } from './ai-vault-tab-title-sync'
import type { AppState } from '@/store/types'

function terminalTab(worktreeId: string, aiVaultTitle?: TerminalTab['aiVaultTitle']): TerminalTab {
  return {
    id: 'tab-1',
    ptyId: null,
    worktreeId,
    title: '⠋ albacore',
    aiVaultTitle,
    customTitle: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
}

function titleResult(agent: 'claude' | 'codex', title: string): AiVaultSessionTitlesResult {
  return { titles: [{ agent, sessionId: `${agent}-session`, title }] }
}

function makeState(args: {
  agent?: 'claude' | 'codex'
  aiVaultTitle?: TerminalTab['aiVaultTitle']
  executionHostId: 'ssh:dev-box' | 'runtime:server-1'
  sleeping?: boolean
  path: string
  worktreeId: string
}) {
  const agent = args.agent ?? 'codex'
  const tab = terminalTab(args.worktreeId, args.aiVaultTitle)
  const listeners = new Set<(state: AppState, previous: AppState) => void>()
  const providerSession = {
    key: 'session_id' as const,
    id: `${agent}-session`,
    transcriptPath: `/sessions/${agent}.jsonl`
  }
  const statusEntry = {
    state: 'done' as const,
    prompt: '',
    updatedAt: 1,
    stateStartedAt: 1,
    agentType: agent,
    paneKey: 'tab-1:leaf-1',
    tabId: 'tab-1',
    worktreeId: args.worktreeId,
    providerSession,
    stateHistory: []
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the sync reads only the slices this fixture fills.
  let state = {
    activeWorktreeId: args.worktreeId,
    activeWorkspaceExecutionHostId: args.executionHostId,
    agentStatusByPaneKey: args.sleeping ? {} : { 'tab-1:leaf-1': statusEntry },
    retainedAgentsByPaneKey: {},
    sleepingAgentSessionsByPaneKey: args.sleeping
      ? {
          'tab-1:leaf-1': {
            paneKey: 'tab-1:leaf-1',
            tabId: 'tab-1',
            worktreeId: args.worktreeId,
            agent,
            providerSession,
            prompt: '',
            state: 'done',
            capturedAt: 1,
            updatedAt: 1,
            origin: 'worktree-sleep'
          }
        }
      : {},
    tabsByWorktree: { [args.worktreeId]: [tab] },
    terminalLayoutsByTabId: {
      'tab-1': {
        root: { type: 'leaf', leafId: 'leaf-1' },
        activeLeafId: 'leaf-1',
        expandedLeafId: null
      }
    },
    worktreesByRepo: {},
    detectedWorktreesByRepo: {},
    folderWorkspaces: [],
    getKnownWorktreeById: () => ({ path: args.path }),
    aiVaultSessionTitlesByKey: {},
    setAiVaultSessionTitles: (titles: AiVaultSessionTitlesResult['titles']) => {
      const previous = state
      state = {
        ...state,
        aiVaultSessionTitlesByKey: {
          ...state.aiVaultSessionTitlesByKey,
          ...Object.fromEntries(
            titles.map((title) => [
              aiVaultSessionTitleKey(title.agent, title.sessionId),
              title.title
            ])
          )
        }
      }
      for (const listener of listeners) {
        listener(state, previous)
      }
    },
    setAiVaultTabTitle: (tabId: string, aiVaultTitle: TerminalTab['aiVaultTitle'] | null) => {
      const previous = state
      state = {
        ...state,
        tabsByWorktree: {
          [args.worktreeId]: state.tabsByWorktree[args.worktreeId].map((entry: TerminalTab) =>
            entry.id === tabId ? { ...entry, aiVaultTitle } : entry
          )
        }
      }
      for (const listener of listeners) {
        listener(state, previous)
      }
    }
  } as unknown as AppState
  return {
    getState: () => state,
    pingAgentStatus: () => {
      const previous = state
      state = {
        ...state,
        agentStatusByPaneKey: Object.fromEntries(
          Object.entries(state.agentStatusByPaneKey).map(([paneKey, entry]) => [
            paneKey,
            { ...entry, updatedAt: entry.updatedAt + 1 }
          ])
        )
      }
      for (const listener of listeners) {
        listener(state, previous)
      }
    },
    addSplitSibling: (sessionId: string) => {
      const previous = state
      const paneKey = 'tab-1:leaf-2'
      const sibling = {
        ...state.agentStatusByPaneKey['tab-1:leaf-1'],
        paneKey,
        providerSession: { key: 'session_id' as const, id: sessionId }
      }
      // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the fixture state is a partial AppState like its builder.
      state = {
        ...state,
        agentStatusByPaneKey: { ...state.agentStatusByPaneKey, [paneKey]: sibling },
        terminalLayoutsByTabId: {
          'tab-1': {
            root: {
              type: 'split',
              direction: 'vertical',
              first: { type: 'leaf', leafId: 'leaf-1' },
              second: { type: 'leaf', leafId: 'leaf-2' }
            },
            activeLeafId: 'leaf-1',
            expandedLeafId: null
          }
        }
      } as unknown as AppState
      for (const listener of listeners) {
        listener(state, previous)
      }
    },
    focusLeaf: (leafId: string) => {
      const previous = state
      state = {
        ...state,
        terminalLayoutsByTabId: {
          'tab-1': { ...state.terminalLayoutsByTabId['tab-1'], activeLeafId: leafId }
        }
      }
      for (const listener of listeners) {
        listener(state, previous)
      }
    },
    setProviderSessionId: (sessionId: string) => {
      const previous = state
      state = {
        ...state,
        agentStatusByPaneKey: Object.fromEntries(
          Object.entries(state.agentStatusByPaneKey).map(([paneKey, entry]) => {
            if (!entry.providerSession) {
              return [paneKey, entry]
            }
            return [
              paneKey,
              { ...entry, providerSession: { ...entry.providerSession, id: sessionId } }
            ]
          })
        )
      }
      for (const listener of listeners) {
        listener(state, previous)
      }
    },
    setWorkspacePath: (path: string) => {
      args.path = path
      const previous = state
      state = { ...state, worktreesByRepo: { changed: [] } }
      for (const listener of listeners) {
        listener(state, previous)
      }
    },
    removeSleepingRecord: () => {
      const previous = state
      state = { ...state, sleepingAgentSessionsByPaneKey: {} }
      for (const listener of listeners) {
        listener(state, previous)
      }
    },
    subscribe: (listener: (next: AppState, previous: AppState) => void) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

describe('AI Vault tab title sync', () => {
  it.each(['claude', 'codex'] as const)(
    'projects the canonical %s AI Vault session title',
    async (agent) => {
      const store = makeState({
        agent,
        executionHostId: 'ssh:dev-box',
        worktreeId: 'worktree-1',
        path: '/workspace/albacore'
      })
      const resolveSessionTitles = vi.fn(async () => titleResult(agent, `${agent} conversation`))
      const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })

      await vi.waitFor(() =>
        expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle).toEqual({
          agent,
          sessionId: `${agent}-session`,
          title: `${agent} conversation`
        })
      )
      expect(resolveSessionTitles).toHaveBeenCalledWith({
        executionHostScope: 'ssh:dev-box',
        requests: [
          {
            agent,
            sessionId: `${agent}-session`,
            transcriptPath: `/sessions/${agent}.jsonl`
          }
        ]
      })
      stop()
    }
  )

  it('titles every session of a split tab, and focus changes never swap them', async () => {
    const store = makeState({
      agent: 'claude',
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    store.addSplitSibling('sibling-session')
    const titles: Record<string, string> = {
      'claude-session': 'Kho skill MCP và plugin',
      'sibling-session': 'Tối ưu claude9 giống Claude thuần'
    }
    const resolveSessionTitles = vi.fn(async (args: { requests: { sessionId: string }[] }) => ({
      titles: args.requests.map((request) => ({
        agent: 'claude' as const,
        sessionId: request.sessionId,
        title: titles[request.sessionId]!
      }))
    }))
    const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })
    const expected = {
      [aiVaultSessionTitleKey('claude', 'claude-session')]: 'Kho skill MCP và plugin',
      [aiVaultSessionTitleKey('claude', 'sibling-session')]: 'Tối ưu claude9 giống Claude thuần'
    }
    await vi.waitFor(() => expect(store.getState().aiVaultSessionTitlesByKey).toEqual(expected))
    store.focusLeaf('leaf-2')
    await vi.waitFor(() =>
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle?.sessionId).toBe(
        'sibling-session'
      )
    )
    expect(store.getState().aiVaultSessionTitlesByKey).toEqual(expected)
    stop()
  })

  it('files a late reply under its own session, never under the session that replaced it', async () => {
    const store = makeState({
      agent: 'claude',
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    let settleOld: (result: AiVaultSessionTitlesResult) => void = () => {}
    const resolveSessionTitles = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<AiVaultSessionTitlesResult>((resolve) => {
            settleOld = resolve
          })
      )
      .mockResolvedValue({
        titles: [{ agent: 'claude', sessionId: 'new-session', title: 'New work' }]
      })
    const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })
    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(1))
    store.setProviderSessionId('new-session')
    settleOld({ titles: [{ agent: 'claude', sessionId: 'claude-session', title: 'Old work' }] })
    await vi.waitFor(() =>
      expect(
        store.getState().aiVaultSessionTitlesByKey[aiVaultSessionTitleKey('claude', 'new-session')]
      ).toBe('New work')
    )
    expect(
      store.getState().aiVaultSessionTitlesByKey[aiVaultSessionTitleKey('claude', 'claude-session')]
    ).toBe('Old work')
    expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle?.title).toBe('New work')
    stop()
  })

  it('uses runtime host authority for folder workspaces', () => {
    const store = makeState({
      executionHostId: 'runtime:server-1',
      worktreeId: 'folder:folder-1',
      path: '/srv/folders/albacore'
    })

    expect(collectAiVaultTitleRequests(store.getState())).toEqual([
      expect.objectContaining({
        executionHostId: 'runtime:server-1',
        tabId: 'tab-1',
        worktreeId: 'folder:folder-1'
      })
    ])
  })

  it('retains a recovered sleeping title after its lifecycle record disappears', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore',
      sleeping: true
    })
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles: async () => titleResult('codex', 'Stable conversation')
    })

    await vi.waitFor(() =>
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle).toBeTruthy()
    )
    store.removeSleepingRecord()
    const restored = store.getState().tabsByWorktree['worktree-1'][0] as TerminalTab
    expect(resolveTerminalTabTitle(restored, false)).toBe('Stable conversation')
    stop()
  })

  it('refreshes a live title when the AI Vault name changes', async () => {
    const store = makeState({
      aiVaultTitle: { agent: 'codex', sessionId: 'codex-session', title: 'First name' },
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    let title = 'First name'
    let refresh: (() => void) | undefined
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles: async () => titleResult('codex', title),
      setTimer: (callback, delay) => {
        expect(delay).toBe(5 * 60_000)
        refresh = callback
        return 1
      },
      clearTimer: () => {}
    })

    await vi.waitFor(() => expect(refresh).toBeTypeOf('function'))
    title = 'Renamed conversation'
    refresh?.()
    await vi.waitFor(() =>
      expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle?.title).toBe(
        'Renamed conversation'
      )
    )
    stop()
  })

  it('retries a missing live title without waiting for the long refresh', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    let refreshDelay: number | undefined
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles: async () => ({ titles: [] }),
      setTimer: (_callback, delay) => {
        refreshDelay = delay
        return 1
      },
      clearTimer: () => {}
    })

    await vi.waitFor(() => expect(refreshDelay).toBe(20_000))
    stop()
  })

  it('defers title reads through the configured background scheduler', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    const resolveSessionTitles = vi.fn(async () => titleResult('codex', 'Deferred conversation'))
    let runScheduled: (() => void) | undefined
    const cancelScheduled = vi.fn()
    const stop = startAiVaultTabTitleSync({
      ...store,
      resolveSessionTitles,
      scheduleReconcile: (callback) => {
        runScheduled = callback
        return cancelScheduled
      }
    })

    expect(resolveSessionTitles).not.toHaveBeenCalled()
    runScheduled?.()
    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(1))
    stop()
  })

  it('does not reread when a live status ping preserves title inputs', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    const resolveSessionTitles = vi.fn(async () => titleResult('codex', 'Stable conversation'))
    const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })

    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(1))
    store.pingAgentStatus()
    await Promise.resolve()
    await Promise.resolve()

    expect(resolveSessionTitles).toHaveBeenCalledTimes(1)
    stop()
  })

  it('does not reread titles when only the worktree path changes', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    const resolveSessionTitles = vi.fn(async () => titleResult('codex', 'Stable conversation'))
    const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })

    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(1))
    store.setWorkspacePath('/workspace/renamed-albacore')
    await Promise.resolve()
    await Promise.resolve()

    expect(resolveSessionTitles).toHaveBeenCalledTimes(1)
    stop()
  })

  it('reconciles immediately when the provider session identity changes', async () => {
    const store = makeState({
      executionHostId: 'ssh:dev-box',
      worktreeId: 'worktree-1',
      path: '/workspace/albacore'
    })
    const resolveSessionTitles = vi.fn(async () => titleResult('codex', 'Original conversation'))
    const stop = startAiVaultTabTitleSync({ ...store, resolveSessionTitles })

    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(1))
    store.setProviderSessionId('codex-session-2')

    await vi.waitFor(() => expect(resolveSessionTitles).toHaveBeenCalledTimes(2))
    expect(store.getState().tabsByWorktree['worktree-1'][0].aiVaultTitle).toBeNull()
    stop()
  })

  it('batches title identities per host within the wire bound', () => {
    const request = (index: number): AiVaultTitleRequest => ({
      agent: 'codex',
      executionHostId: 'ssh:dev-box',
      providerSession: { key: 'session_id', id: `session-${index}` },
      refresh: true,
      tabId: `tab-${index}`,
      worktreeId: `worktree-${index}`
    })
    const groups = batchAiVaultTitleRequests(
      Array.from({ length: 65 }, (_, index) => request(index))
    )

    expect(groups).toHaveLength(2)
    expect(groups[0]).toHaveLength(64)
    expect(groups[1]).toHaveLength(1)
  })

  it('runs hosts concurrently while serializing each host wire', async () => {
    const request = (executionHostId: AiVaultTitleRequest['executionHostId'], index: number) => ({
      agent: 'codex' as const,
      executionHostId,
      providerSession: { key: 'session_id' as const, id: `session-${index}` },
      refresh: true,
      tabId: `tab-${index}`,
      worktreeId: `worktree-${index}`
    })
    const requests = [
      ...Array.from({ length: 65 }, (_, index) => request('ssh:dev-box', index)),
      request('runtime:server-1', 100)
    ]
    const calls: AiVaultTitleRequest[][] = []
    const completions: (() => void)[] = []
    const pending = settleAiVaultTitleRequestBatches(
      requests,
      (batch) =>
        new Promise<void>((resolve) => {
          calls.push(batch)
          completions.push(resolve)
        })
    )

    await vi.waitFor(() => expect(calls).toHaveLength(2))
    expect(calls.map((batch) => batch[0]!.executionHostId)).toEqual([
      'ssh:dev-box',
      'runtime:server-1'
    ])
    completions[0]!()
    await vi.waitFor(() => expect(calls).toHaveLength(3))
    expect(calls[2]).toHaveLength(1)
    completions[1]!()
    completions[2]!()
    await pending
  })
})
