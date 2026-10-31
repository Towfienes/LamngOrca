import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.useRealTimers())

it('sends only changed drafts and notebook dirty transitions instead of copying every open file on every cell event', async () => {
  vi.useFakeTimers()
  const events = new Map<string, (...args: unknown[]) => void>()
  const sent: Record<string, unknown>[] = []
  const connection = { readyState: 0 }
  const on = (name: string) => (listener: (...args: unknown[]) => void) => {
    events.set(name, listener)
    return { dispose() {} }
  }
  const text = {
    uri: { scheme: 'file', fsPath: '/repo/code.py' },
    version: 1,
    isDirty: false,
    getText: vi.fn(() => 'print(42)')
  }
  const notebook = { uri: { fsPath: '/repo/slides.ipynb' }, isDirty: false }
  const vscode = {
    workspace: {
      getConfiguration: () => ({ inspect: () => undefined }),
      workspaceFile: { fsPath: '/profile/test.code-workspace' },
      textDocuments: [text],
      notebookDocuments: [notebook],
      onDidChangeTextDocument: on('text'),
      onDidSaveTextDocument: on('saveText'),
      onDidCloseTextDocument: on('closeText'),
      onDidCloseNotebookDocument: on('closeNotebook'),
      onDidChangeNotebookDocument: on('notebook'),
      onDidSaveNotebookDocument: on('saveNotebook')
    },
    window: {
      onDidChangeActiveTextEditor: on('activeText'),
      onDidChangeActiveNotebookEditor: on('activeNotebook')
    },
    commands: { executeCommand: async () => undefined },
    Uri: { file: (path: string) => ({ fsPath: path }) }
  }
  class Socket {
    static OPEN = 1
    get readyState() {
      return connection.readyState
    }
    addEventListener(name: string, listener: (...args: unknown[]) => void) {
      events.set(name, listener)
    }
    send(value: string) {
      sent.push(JSON.parse(value))
    }
    close() {}
  }
  const extension = { activate: async (_context: { subscriptions: unknown[] }) => {} }
  runInNewContext(readFileSync('resources/vscode-editor-bridge/extension.cjs', 'utf8'), {
    exports: extension,
    require: (name: string) => (name === 'vscode' ? vscode : { basename }),
    process: { env: { ORCA_VSCODE_BRIDGE: 'ws://127.0.0.1/test' } },
    WebSocket: Socket,
    setTimeout,
    clearTimeout
  })
  await extension.activate({ subscriptions: [] })
  await vi.advanceTimersByTimeAsync(60)
  expect(sent).toEqual([])
  expect(text.getText).not.toHaveBeenCalled()
  connection.readyState = 1
  events.get('open')?.()
  expect(sent.filter((message) => message.type === 'state')).toHaveLength(2)
  vi.clearAllTimers()
  sent.length = 0
  text.getText.mockClear()
  events.get('notebook')?.()
  await vi.advanceTimersByTimeAsync(60)
  expect(sent).toEqual([])
  expect(text.getText).not.toHaveBeenCalled()
  notebook.isDirty = true
  events.get('notebook')?.()
  await vi.advanceTimersByTimeAsync(60)
  events.get('notebook')?.()
  await vi.advanceTimersByTimeAsync(60)
  expect(sent).toEqual([{ type: 'state', path: '/repo/slides.ipynb', dirty: true, active: false }])
  text.isDirty = true
  text.version++
  events.get('text')?.()
  await vi.advanceTimersByTimeAsync(60)
  expect(text.getText).toHaveBeenCalledOnce()
  expect(sent.at(-1)).toMatchObject({ path: '/repo/code.py', content: 'print(42)', dirty: true })
  notebook.isDirty = false
  events.get('saveNotebook')?.(notebook)
  expect(sent.at(-1)).toMatchObject({ path: '/repo/slides.ipynb', dirty: false })
  sent.length = 0
  events.get('activeNotebook')?.({ notebook })
  expect(sent.at(-1)).toMatchObject({ path: '/repo/slides.ipynb', active: true })
  sent.length = 0
  events.get('message')?.({
    data: JSON.stringify({ op: 'open', path: '/repo/slides.ipynb', requestId: 'repeat' })
  })
  await vi.advanceTimersByTimeAsync(1)
  expect(sent).toContainEqual({
    type: 'state',
    path: '/repo/slides.ipynb',
    dirty: false,
    active: true
  })
})
