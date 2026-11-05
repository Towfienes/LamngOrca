import { defineFixture } from '../../component-fixtures/component-fixture'
import { useAppStore } from '@/store'
import { createEmptyMemorySnapshot } from '../../web/preload-api/web-memory-api'
import { DeckCreateBar } from './DeckCreateBar'

export const narrow = defineFixture({
  width: 252,
  store: { activeWorktreeId: 'fixture', activeGroupIdByWorktree: { fixture: 'fixture-group' } },
  setup() {
    useAppStore.setState({
      memorySnapshot: {
        ...createEmptyMemorySnapshot(),
        worktrees: [
          {
            worktreeId: 'fixture',
            worktreeName: 'Notebook review',
            repoId: 'fixture',
            repoName: 'fixture',
            cpu: 0,
            memory: 0,
            history: [],
            sessions: [
              {
                sessionId: 'idle',
                paneKey: null,
                pid: 1,
                cpu: 0,
                memory: 0,
                idle: {
                  idleSince: Date.now() - 3_600_000,
                  frozen: true,
                  cgroupMemory: 64 * 1024 * 1024,
                  cgroupSwap: 0
                }
              }
            ]
          }
        ]
      }
    })
  },
  render: () => <DeckCreateBar />
})
