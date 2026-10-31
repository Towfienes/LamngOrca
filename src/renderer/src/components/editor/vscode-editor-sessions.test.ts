import { afterEach, expect, it, vi } from 'vitest'
import { useAppStore } from '@/store'
import { createLegacyEditorStore } from './editor-autosave-controller-test-fixture'
import {
  subscribeVSCodeEditorState,
  vscodeEditorContexts,
  vscodeEditorSessions
} from './vscode-editor-sessions'
import type { VSCodeEditorSnapshot } from '../../../../shared/vscode-editor'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vscodeEditorSessions.clear()
  vscodeEditorContexts.clear()
})

it('preserves recovered and read-only Orca drafts while accepting changes from their actual VS Code owner', () => {
  const store = createLegacyEditorStore()
  store.setState({
    setActiveWorktree: vi.fn(),
    setActiveFolderWorkspace: vi.fn(),
    focusGroup: vi.fn()
  })
  store.getState().openFile({
    filePath: '/repo/file.py',
    relativePath: 'file.py',
    worktreeId: 'wt-1',
    language: 'python',
    mode: 'edit'
  })
  const file = store.getState().openFiles[0]!
  store.getState().setEditorDraft(file.id, 'recovered changes')
  store.getState().markFileDirty(file.id, true)
  vi.spyOn(useAppStore, 'getState').mockImplementation(store.getState)
  vi.spyOn(useAppStore, 'subscribe').mockImplementation(store.subscribe)
  let receive: (snapshot: VSCodeEditorSnapshot) => void = () => {
    throw new Error('State listener was not registered')
  }
  const events = new EventTarget()
  vi.stubGlobal('window', {
    dispatchEvent: events.dispatchEvent.bind(events),
    api: {
      vscodeEditor: {
        onClose: () => () => {},
        onState: (callback: typeof receive) => {
          receive = callback
          return () => {}
        },
        discard: vi.fn().mockResolvedValue(undefined)
      }
    }
  })
  vscodeEditorContexts.set('pane', {
    worktreeId: 'wt-1',
    groupId: 'group',
    rootPath: '/repo',
    filePath: '/repo/other.py'
  })
  subscribeVSCodeEditorState()
  receive({
    type: 'state',
    paneId: 'pane',
    path: file.filePath,
    dirty: false,
    content: 'disk text',
    active: true
  })
  expect(store.getState().editorDrafts[file.id]).toBe('recovered changes')
  expect(store.getState().openFiles[0]?.isDirty).toBe(true)
  expect(vscodeEditorSessions.has(file.filePath)).toBe(false)

  vscodeEditorSessions.set(file.filePath, { id: 'pane' })
  store.setState({
    openFiles: store.getState().openFiles.map((file) => ({ ...file, readOnly: true }))
  })
  receive({
    type: 'state',
    paneId: 'pane',
    path: file.filePath,
    dirty: false,
    content: 'disk text'
  })
  expect(store.getState().editorDrafts[file.id]).toBe('recovered changes')

  store.setState({
    openFiles: store.getState().openFiles.map((file) => ({ ...file, readOnly: false }))
  })
  receive({
    type: 'state',
    paneId: 'pane',
    path: file.filePath,
    dirty: true,
    content: 'actual VS Code edit'
  })
  expect(store.getState().editorDrafts[file.id]).toBe('actual VS Code edit')
  receive({
    type: 'state',
    paneId: 'pane',
    path: file.filePath,
    dirty: false,
    content: 'actual VS Code edit'
  })
  expect(store.getState().editorDrafts[file.id]).toBeUndefined()
  expect(store.getState().openFiles[0]?.isDirty).toBe(false)
})
