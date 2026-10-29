// @vitest-environment happy-dom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type * as TabDotsModule from '@/lib/workspace-tab-dots'
import type { WorkspaceTabDot } from '@/lib/workspace-tab-dots'

const mocks = vi.hoisted(() => {
  const dots: WorkspaceTabDot[] = []
  return {
    dots,
    focusGroup: vi.fn(),
    activateTab: vi.fn(),
    setActiveTab: vi.fn(),
    setActiveTabType: vi.fn(),
    focusSurface: vi.fn()
  }
})
vi.mock('@/lib/workspace-tab-dots', async (importOriginal) => ({
  ...(await importOriginal<typeof TabDotsModule>()),
  createWorkspaceTabDotsSelector: () => () => mocks.dots,
  selectTabDotsHostGroupId: () => 'g1'
}))
vi.mock('@/lib/focus-terminal-tab-surface', () => ({
  focusTerminalTabSurface: mocks.focusSurface
}))
vi.mock('@/runtime/web-runtime-session-environment', () => ({
  isWebRuntimeSessionActive: () => false
}))
vi.mock('@/runtime/web-runtime-session-tab-lifecycle', () => ({
  activateWebRuntimeSessionTab: vi.fn()
}))
vi.mock('@/lib/worktree-runtime-owner', () => ({
  runtimeEnvironmentIdOrLocalUnlessTwin: () => null
}))
vi.mock('@/lib/agent-session/structured-agent-session-tab-activation', () => ({
  activateStructuredAgentSessionTab: vi.fn()
}))
vi.mock('@/store', () => {
  const state = {
    focusGroup: mocks.focusGroup,
    activateTab: mocks.activateTab,
    setActiveTab: mocks.setActiveTab,
    setActiveTabType: mocks.setActiveTabType,
    unifiedTabsByWorktree: {
      wt: [
        { id: 'a', groupId: 'g1', contentType: 'terminal', entityId: 'term-a' },
        { id: 'b', groupId: 'g1', contentType: 'terminal', entityId: 'term-b' }
      ]
    },
    terminalLayoutsByTabId: { 'term-b': { activeLeafId: 'leaf-b' } }
  }
  return {
    useAppStore: Object.assign((selector: (value: typeof state) => unknown) => selector(state), {
      getState: () => state
    })
  }
})
const { WorkspaceTabDots } = await import('./WorkspaceTabDots')

const dot = (overrides: Partial<WorkspaceTabDot>): WorkspaceTabDot => ({
  id: 'a',
  groupId: 'g1',
  title: 'Review',
  paneCount: 3,
  previewTabId: 'term-a',
  agent: null,
  contentType: 'terminal',
  attention: null,
  panes: [],
  active: true,
  ...overrides
})

const setDots = (...items: WorkspaceTabDot[]): void => {
  mocks.dots.splice(0, mocks.dots.length, ...items)
}

let host: HTMLDivElement
beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div')
  document.body.append(host)
  for (const mock of Object.values(mocks)) {
    if (typeof mock === 'function') {
      mock.mockClear()
    }
  }
})
afterEach(() => host.remove())

const newWorkspace = vi.fn()
const closeTab = vi.fn()

function render(groupId: string | undefined): void {
  host.replaceChildren()
  const container = document.createElement('div')
  host.append(container)
  const root = createRoot(container)
  act(() =>
    root.render(
      <WorkspaceTabDots
        worktreeId="wt"
        groupId={groupId}
        onNewWorkspace={newWorkspace}
        onCloseTab={closeTab}
      />
    )
  )
}

it('renders labelled dots with active and attention state', () => {
  setDots(
    dot({}),
    dot({
      id: 'b',
      title: 'Build',
      paneCount: 1,
      previewTabId: 'term-b',
      active: false,
      attention: 'waiting'
    })
  )
  render('g1')
  const buttons = [...host.querySelectorAll('button.deck-tab-dot:not([data-empty])')]
  expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
    'Review, 3 panes',
    'Build, 1 pane, waiting for input'
  ])
  expect(buttons.map((button) => button.getAttribute('aria-current'))).toEqual(['true', null])
  expect(buttons[1].getAttribute('data-attention')).toBe('waiting')
})

it('shows a single active pill when the group has one tab', () => {
  setDots(dot({}))
  render('g1')
  const buttons = host.querySelectorAll('button.deck-tab-dot:not([data-empty])')
  expect(buttons).toHaveLength(1)
  expect(buttons[0].getAttribute('data-active')).toBe('true')
})

it('renders nothing in other groups strips or without tabs', () => {
  setDots(dot({}), dot({ id: 'b', active: false }))
  render('g2')
  expect(host.querySelector('.deck-tab-dots')).toBeNull()
  setDots()
  render('g1')
  expect(host.querySelector('.deck-tab-dots')).toBeNull()
})

it('activates the clicked tab through the tab activation actions', () => {
  setDots(dot({}), dot({ id: 'b', title: 'Build', previewTabId: 'term-b', active: false }))
  render('g1')
  const inactive = host.querySelectorAll<HTMLButtonElement>(
    'button.deck-tab-dot:not([data-empty])'
  )[1]
  act(() => inactive.click())
  expect(mocks.focusGroup).toHaveBeenCalledWith('wt', 'g1')
  expect(mocks.activateTab).toHaveBeenCalledWith('b')
  expect(mocks.setActiveTab).toHaveBeenCalledWith('term-b')
  expect(mocks.setActiveTabType).toHaveBeenCalledWith('terminal', 'wt')
  expect(mocks.focusSurface).toHaveBeenCalledWith('term-b', 'leaf-b')
})

it('appends three hollow slots that each open a new workspace', () => {
  newWorkspace.mockClear()
  setDots(dot({}), dot({ id: 'b', active: false }))
  render('g1')
  const slots = host.querySelectorAll<HTMLButtonElement>('button.deck-tab-dot[data-empty]')
  expect([...slots].map((slot) => slot.getAttribute('aria-label'))).toEqual([
    'New workspace 3',
    'New workspace 4',
    'New workspace 5'
  ])
  act(() => slots[1].click())
  expect(newWorkspace).toHaveBeenCalledTimes(1)
})

it('draws the agent icon inside an agent workspace and a content icon otherwise', () => {
  setDots(dot({ agent: 'claude' }), dot({ id: 'b', active: false, contentType: 'browser' }))
  render('g1')
  const [agentDot, browserDot] = host.querySelectorAll('button.deck-tab-dot:not([data-empty])')
  expect(agentDot.querySelector('svg, img')).not.toBeNull()
  expect(browserDot.querySelector('svg.lucide-globe, svg')).not.toBeNull()
  expect(agentDot.innerHTML).not.toBe(browserDot.innerHTML)
})

it('closes a workspace with a middle click on its dot', () => {
  closeTab.mockClear()
  setDots(dot({}), dot({ id: 'b', active: false }))
  render('g1')
  const dots = host.querySelectorAll<HTMLButtonElement>('button.deck-tab-dot:not([data-empty])')
  act(() => {
    dots[1].dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }))
  })
  expect(closeTab).toHaveBeenCalledWith('b')
  act(() => {
    dots[0].dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 2 }))
  })
  expect(closeTab).toHaveBeenCalledTimes(1)
})

it('draws one icon per pane and middle click closes only the pane under the pointer', () => {
  closeTab.mockClear()
  const closed: unknown[] = []
  const onClosePane = (event: Event): void => {
    closed.push(event instanceof CustomEvent ? event.detail : null)
  }
  window.addEventListener('orca-close-terminal-pane', onClosePane)
  setDots(
    dot({
      paneCount: 3,
      panes: [
        { leafId: 'l1', agent: 'claude', attention: 'running' },
        { leafId: 'l2', agent: 'codex', attention: null },
        { leafId: 'l3', agent: null, attention: null }
      ]
    })
  )
  render('g1')
  const panes = host.querySelectorAll<HTMLElement>('[data-dot-pane-leaf]')
  expect([...panes].map((pane) => pane.dataset.dotPaneLeaf)).toEqual(['l1', 'l2', 'l3'])
  act(() => {
    panes[1].dispatchEvent(new MouseEvent('auxclick', { bubbles: true, button: 1 }))
  })
  window.removeEventListener('orca-close-terminal-pane', onClosePane)
  expect(closed).toEqual([{ tabId: 'term-a', leafId: 'l2' }])
  expect(closeTab).not.toHaveBeenCalled()
})
