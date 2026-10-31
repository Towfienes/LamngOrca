import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useWorkspaceLaunchSelection } from './workspace-launch-selection'

beforeEach(() =>
  useWorkspaceLaunchSelection.setState({ workspaceId: null, tabCount: 0, layouts: {} })
)
afterEach(() => vi.unstubAllGlobals())

it('selects a shell-free draft without replacing existing workspace tabs', () => {
  useWorkspaceLaunchSelection.getState().open('worktree-a', 2)
  expect(useWorkspaceLaunchSelection.getState()).toMatchObject({
    workspaceId: 'worktree-a',
    tabCount: 2
  })
  useWorkspaceLaunchSelection.getState().dismiss('worktree-b')
  expect(useWorkspaceLaunchSelection.getState().workspaceId).toBe('worktree-a')
  useWorkspaceLaunchSelection.getState().dismiss('worktree-a')
  expect(useWorkspaceLaunchSelection.getState().workspaceId).toBeNull()
})

it('distinguishes the selected empty slot even when the workspace and tab count stay the same', () => {
  const state = useWorkspaceLaunchSelection.getState()
  state.open('worktree-a', 1, 1)
  expect(useWorkspaceLaunchSelection.getState().slotIndex).toBe(1)
  state.open('worktree-a', 1, 2)
  expect(useWorkspaceLaunchSelection.getState().slotIndex).toBe(2)
  state.open('worktree-a', 1, 3)
  expect(useWorkspaceLaunchSelection.getState().slotIndex).toBe(3)
  expect(useWorkspaceLaunchSelection.getState().tabCount).toBe(1)
})

it('keeps the selected slot and holes when tabs open or close', () => {
  const state = useWorkspaceLaunchSelection.getState()
  state.reconcile('workspace', 'group', ['a'])
  state.open('workspace', 1, 2, 'group')
  state.reconcile('workspace', 'group', ['a', 'b'])
  const key = JSON.stringify(['workspace', 'group'])
  expect(useWorkspaceLaunchSelection.getState().layouts[key]).toEqual(['a', null, 'b'])
  state.dismiss('workspace')
  state.reconcile('workspace', 'group', ['b'])
  expect(useWorkspaceLaunchSelection.getState().layouts[key]).toEqual([null, null, 'b'])
  state.reconcile('workspace', 'group', ['b', 'c'])
  expect(useWorkspaceLaunchSelection.getState().layouts[key]).toEqual(['c', null, 'b'])
})

it('restores slot positions after a fresh store loads the profile storage', async () => {
  const saved = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => saved.set(key, value)
  })
  const state = useWorkspaceLaunchSelection.getState()
  state.reconcile('workspace', 'group', ['a'])
  state.open('workspace', 1, 2, 'group')
  state.reconcile('workspace', 'group', ['a', 'b'])
  vi.resetModules()
  const restored = (await import('./workspace-launch-selection')).useWorkspaceLaunchSelection
  restored.getState().reconcile('workspace', 'group', ['a', 'b'])
  expect(restored.getState().layouts[JSON.stringify(['workspace', 'group'])]).toEqual([
    'a',
    null,
    'b'
  ])
})

it('keeps a usable in-memory layout if profile storage is corrupt or unavailable', () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.stubGlobal('localStorage', {
    getItem: () => '{broken',
    setItem: () => {
      throw new Error('storage unavailable')
    }
  })
  const state = useWorkspaceLaunchSelection.getState()
  state.reconcile('folder:example', 'group', ['a'])
  state.open('folder:example', 1, 2, 'group')
  state.reconcile('folder:example', 'group', ['a', 'b'])
  expect(
    useWorkspaceLaunchSelection.getState().layouts[JSON.stringify(['folder:example', 'group'])]
  ).toEqual(['a', null, 'b'])
  warning.mockRestore()
})

it('keeps the slot when an editor preview is replaced in the same layout update', () => {
  const state = useWorkspaceLaunchSelection.getState()
  state.reconcile('workspace', 'previews', ['a'])
  state.open('workspace', 1, 2, 'previews')
  state.reconcile('workspace', 'previews', ['a', 'preview'])
  state.dismiss('workspace')
  state.reconcile('workspace', 'previews', ['a', 'next-preview'])
  expect(
    useWorkspaceLaunchSelection.getState().layouts[JSON.stringify(['workspace', 'previews'])]
  ).toEqual(['a', null, 'next-preview'])
})
