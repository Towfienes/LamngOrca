// @vitest-environment happy-dom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'

const LEAF = '11111111-1111-4111-8111-111111111111'
const state = vi.hoisted(() => {
  const agentStatusByPaneKey: Record<string, object> = {}
  return {
    activeWorktreeId: 'workspace',
    activeGroupIdByWorktree: { workspace: 'group' },
    tabsByWorktree: { workspace: [{ id: 'tab-1' }] },
    agentStatusByPaneKey,
    openModal: vi.fn()
  }
})
vi.mock('@/store', () => ({
  useAppStore: (selector: (value: typeof state) => unknown) => selector(state)
}))
const { DeckCreateBar } = await import('./DeckCreateBar')

function renderBar(): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = renderToStaticMarkup(
    <TooltipProvider>
      <DeckCreateBar />
    </TooltipProvider>
  )
  return root
}

beforeEach(() => {
  state.agentStatusByPaneKey = {}
})

it('lays out create and agents groups without a DeepSeek button', () => {
  const root = renderBar()
  const buttons = [...root.querySelectorAll('.deck-agent-actions button')]
  expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
    'New worktree',
    'Add folder',
    'New blank terminal',
    'New Claude session',
    'New Codex session',
    'New Antigravity session',
    'New agent'
  ])
  expect(root.querySelectorAll('.deck-dock-label')).toHaveLength(0)
  expect(
    [...root.querySelectorAll('[role="group"]')].map((group) => group.getAttribute('aria-label'))
  ).toEqual(['Create', 'Agents'])
  expect(root.querySelector('img[src*="dsh"]')).toBeNull()
  expect(root.querySelector('.deck-agent-running-dot')).toBeNull()
})

it('marks only agent types with a live pane in the active worktree', () => {
  state.agentStatusByPaneKey = {
    [`tab-1:${LEAF}`]: { agentType: 'claude', state: 'working', paneKey: `tab-1:${LEAF}` },
    'other-tab:22222222-2222-4222-8222-222222222222': { agentType: 'codex', state: 'working' }
  }
  const running = [...renderBar().querySelectorAll('.deck-agent-quick-button')]
    .filter((slot) => slot.querySelector('.deck-agent-running-dot'))
    .map((slot) => slot.querySelector('button')?.getAttribute('aria-label'))
  expect(running).toEqual(['New Claude session'])
})
