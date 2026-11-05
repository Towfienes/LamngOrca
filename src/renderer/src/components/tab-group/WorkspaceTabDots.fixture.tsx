import { defineFixture } from '../../component-fixtures/component-fixture'
import { WorkspaceTabDots } from './WorkspaceTabDots'
import { useWorkspaceLaunchSelection } from '@/store/workspace-launch-selection'

const first = '11111111-1111-4111-8111-111111111111'
const second = '22222222-2222-4222-8222-222222222222'
const third = '33333333-3333-4333-8333-333333333333'

export const agents = defineFixture({
  width: 240,
  setup: () => useWorkspaceLaunchSelection.getState().dismiss('fixture'),
  store: {
    activeWorktreeId: 'fixture',
    activeGroupIdByWorktree: { fixture: 'group' },
    groupsByWorktree: {
      fixture: [{ id: 'group', worktreeId: 'fixture', activeTabId: 'tab', tabOrder: ['tab'] }]
    },
    layoutByWorktree: { fixture: { type: 'leaf', groupId: 'group' } },
    unifiedTabsByWorktree: {
      fixture: [
        {
          id: 'tab',
          entityId: 'terminal',
          groupId: 'group',
          worktreeId: 'fixture',
          contentType: 'terminal',
          label: 'Review',
          customLabel: null,
          color: null,
          sortOrder: 0,
          createdAt: 1
        }
      ]
    },
    terminalLayoutsByTabId: {
      terminal: {
        root: {
          type: 'split',
          direction: 'vertical',
          first: { type: 'leaf', leafId: first },
          second: { type: 'leaf', leafId: second }
        },
        activeLeafId: first,
        expandedLeafId: null
      }
    },
    agentStatusByPaneKey: {
      [`terminal:${first}`]: {
        paneKey: `terminal:${first}`,
        agentType: 'codex',
        state: 'working',
        prompt: '',
        updatedAt: 1,
        stateStartedAt: 1,
        stateHistory: []
      },
      [`terminal:${second}`]: {
        paneKey: `terminal:${second}`,
        agentType: 'claude',
        state: 'working',
        prompt: '',
        updatedAt: 1,
        stateStartedAt: 1,
        stateHistory: []
      }
    }
  },
  render: () => (
    <WorkspaceTabDots
      worktreeId="fixture"
      groupId="group"
      onNewWorkspace={() => {}}
      onCloseTab={() => {}}
    />
  )
})

export const single = defineFixture({
  ...agents,
  store: {
    ...agents.store,
    terminalLayoutsByTabId: {
      terminal: {
        root: { type: 'leaf', leafId: second },
        activeLeafId: second,
        expandedLeafId: null
      }
    }
  }
})

export const threePanes = defineFixture({
  ...agents,
  store: {
    ...agents.store,
    terminalLayoutsByTabId: {
      terminal: {
        root: {
          type: 'split',
          direction: 'vertical',
          first: { type: 'leaf', leafId: first },
          second: {
            type: 'split',
            direction: 'horizontal',
            first: { type: 'leaf', leafId: second },
            second: { type: 'leaf', leafId: third }
          }
        },
        activeLeafId: first,
        expandedLeafId: null
      }
    }
  }
})

export const emptySelected = defineFixture({
  ...agents,
  setup: () => useWorkspaceLaunchSelection.getState().open('fixture', 1, 2, 'group')
})

export const focused = defineFixture({
  ...agents,
  interact: (frame) => frame.querySelector<HTMLButtonElement>('button.deck-tab-dot')?.focus()
})
