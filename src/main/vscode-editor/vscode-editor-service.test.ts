import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { WebContents } from 'electron'
import type { VSCodeEditorSnapshot } from '../../shared/vscode-editor'
import { VSCODE_EDITOR_PARTITION } from '../../shared/vscode-editor'

const state = vi.hoisted(() => ({
  directory: '',
  snapshot: (_value: VSCodeEditorSnapshot): void => {},
  request: vi.fn().mockResolvedValue(undefined),
  stop: vi.fn()
}))
vi.mock('electron', () => ({
  app: { getPath: () => state.directory, once: vi.fn() },
  session: { fromPartition: vi.fn() },
  shell: { openExternal: vi.fn() }
}))
vi.mock('./vscode-runtime', () => ({
  startVSCodeRuntime: async () => ({
    origin: 'http://127.0.0.1:45555',
    token: 'test-token',
    stop: state.stop
  })
}))
vi.mock('./vscode-bridge', () => ({
  VSCodeBridge: class {
    constructor(_connected: unknown, snapshot: typeof state.snapshot) {
      state.snapshot = snapshot
    }
    listen = async () => 'ws://127.0.0.1:45556/test'
    connected = () => false
    request = state.request
    dispose = vi.fn()
  }
}))

function owner(id: number): WebContents {
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the service tests use only these owner identity, liveness and delivery methods.
  return { id, isDestroyed: () => false, send: vi.fn() } as unknown as WebContents
}

describe('VS Code editor ownership', () => {
  it('saves notebook documents without copying their serialized outputs into Orca', async () => {
    const service = await import('./vscode-editor-service')
    const renderer = owner(1)
    const filePath = join(state.directory, 'slides.IPYNB')
    await writeFile(filePath, '{"cells":[{"outputs":["notebook payload"]}]}')
    const handle = await service.openVSCodeEditor(renderer, {
      paneKey: 'notebook',
      filePath,
      rootPath: state.directory,
      background: '#080808',
      foreground: '#eeeeee'
    })
    await service.operateVSCodeEditor(renderer, handle.id, filePath, 'save')
    expect(renderer.send).toHaveBeenCalledWith('vscodeEditor:state', {
      type: 'state',
      paneId: handle.id,
      path: filePath,
      dirty: false
    })
  })
  beforeEach(async () => {
    vi.resetModules()
    state.directory = await mkdtemp(join(tmpdir(), 'orca-vscode-owner-'))
  })
  afterEach(async () => {
    vi.useRealTimers()
    await rm(state.directory, { recursive: true, force: true })
  })

  it('keeps the shared server while another pane exists and stops it after the last editor closes', async () => {
    vi.useFakeTimers()
    state.stop.mockClear()
    const service = await import('./vscode-editor-service')
    const renderer = owner(1)
    const request = {
      paneKey: 'one',
      filePath: join(state.directory, 'first.py'),
      rootPath: state.directory,
      background: '#080808',
      foreground: '#eeeeee'
    }
    const first = await service.openVSCodeEditor(renderer, request)
    const second = await service.openVSCodeEditor(renderer, {
      ...request,
      paneKey: 'two',
      filePath: join(state.directory, 'second.py')
    })
    service.releaseVSCodeEditor(renderer, first.id)
    await vi.advanceTimersByTimeAsync(5001)
    expect(state.stop).not.toHaveBeenCalled()
    expect(service.isVSCodeEditorAttach(VSCODE_EDITOR_PARTITION, second.url)).toBe(true)
    service.releaseVSCodeEditor(renderer, second.id)
    await vi.advanceTimersByTimeAsync(5001)
    expect(state.stop).toHaveBeenCalledOnce()
    expect(service.isVSCodeEditorAttach(VSCODE_EDITOR_PARTITION, second.url)).toBe(false)
  })

  it('admits only exact live editor URLs and keeps save authority scoped to owner and opened paths', async () => {
    const service = await import('./vscode-editor-service')
    const first = owner(1)
    const second = owner(2)
    const filePath = join(state.directory, 'test.py')
    await writeFile(filePath, 'print(42)')
    const handle = await service.openVSCodeEditor(first, {
      paneKey: 'one',
      filePath,
      rootPath: state.directory,
      background: '#080808',
      foreground: '#eeeeee'
    })
    expect(service.isVSCodeEditorAttach(VSCODE_EDITOR_PARTITION, handle.url)).toBe(true)
    expect(service.isVSCodeEditorAttach('persist:browsing', handle.url)).toBe(false)
    expect(service.isVSCodeEditorAttach(VSCODE_EDITOR_PARTITION, `${handle.url}&extra=1`)).toBe(
      false
    )
    await expect(service.operateVSCodeEditor(second, handle.id, filePath, 'save')).rejects.toThrow(
      'not owned'
    )
    await expect(
      service.operateVSCodeEditor(first, handle.id, join(state.directory, 'other.py'), 'save')
    ).rejects.toThrow('not owned')
    state.snapshot({
      type: 'state',
      paneId: handle.id,
      path: join(state.directory, 'secret.py'),
      dirty: true,
      content: 'private'
    })
    expect(first.send).not.toHaveBeenCalled()
    state.snapshot({
      type: 'state',
      paneId: handle.id,
      path: filePath,
      dirty: true,
      content: 'edited'
    })
    expect(first.send).toHaveBeenCalledWith(
      'vscodeEditor:state',
      expect.objectContaining({ path: filePath, dirty: true })
    )
    const definition = join(state.directory, 'definition.py')
    state.snapshot({
      type: 'state',
      paneId: handle.id,
      path: definition,
      dirty: false,
      active: true,
      content: 'def example(): pass'
    })
    expect(first.send).toHaveBeenCalledWith(
      'vscodeEditor:state',
      expect.objectContaining({ path: definition, active: true })
    )
    await service.operateVSCodeEditor(first, handle.id, filePath, 'save')
    service.releaseVSCodeEditor(first, handle.id)
    expect(service.isVSCodeEditorAttach(VSCODE_EDITOR_PARTITION, handle.url)).toBe(false)
  })

  it('refuses a second independent VS Code buffer for the same path instead of saving the wrong pane', async () => {
    const service = await import('./vscode-editor-service')
    const first = owner(1)
    const request = {
      paneKey: 'one',
      filePath: join(state.directory, 'test.py'),
      rootPath: state.directory,
      background: '#080808',
      foreground: '#eeeeee'
    }
    await mkdir(join(state.directory, 'vscode-editor/user/User'), { recursive: true })
    await writeFile(join(state.directory, 'vscode-editor/user/User/settings.json'), '{}')
    await service.openVSCodeEditor(first, request)
    await expect(service.openVSCodeEditor(first, { ...request, paneKey: 'two' })).rejects.toThrow(
      'already open'
    )
    await expect(service.openVSCodeEditor(owner(2), request)).rejects.toThrow('another Orca window')
  })
})
