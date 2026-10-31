import { app, session, shell, type WebContents } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve, isAbsolute, extname } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  VSCODE_EDITOR_PARTITION,
  type VSCodeEditorOpen,
  type VSCodeEditorHandle
} from '../../shared/vscode-editor'
import { normalizeExternalBrowserUrl } from '../../shared/browser-url'
import { VSCODE_EDITOR_PERFORMANCE_SETTINGS, vscodeWorkspaceId } from './vscode-profile'
import { VSCodeBridge } from './vscode-bridge'
import { startVSCodeRuntime } from './vscode-runtime'
import { setupGuestShortcutForwarding } from '../browser/browser-guest-shortcut-forwarding'
import { matchesGuestTabShortcut } from '../browser/browser-guest-tab-shortcut'
import { resolveWindowShortcutAction } from '../../shared/window-shortcut-policy'
import type { KeybindingOverrides } from '../../shared/keybindings'

type Pane = {
  owner: WebContents
  request: VSCodeEditorOpen
  paths: Map<string, string>
  url: string
  active: boolean
  guest?: WebContents
  disposeShortcuts?: () => void
}

function pathKey(path: string): string {
  return process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
}

const panes = new Map<string, Pane>()
let runtime: Awaited<ReturnType<typeof startVSCodeRuntime>> | null = null
let starting: Promise<void> | null = null
let idleStop: ReturnType<typeof setTimeout> | undefined
let quitHookInstalled = false
let getKeybindings: () => KeybindingOverrides | undefined = () => undefined

export function setVSCodeEditorKeybindings(resolver: () => KeybindingOverrides | undefined): void {
  getKeybindings = resolver
}

function installEditorShortcuts(pane: Pane): void {
  pane.disposeShortcuts?.()
  if (!pane.guest || pane.guest.isDestroyed()) {
    return
  }
  pane.disposeShortcuts = setupGuestShortcutForwarding({
    browserTabId: pane.request.viewId ?? pane.request.filePath,
    guest: pane.guest,
    resolveRenderer: () => (pane.owner.isDestroyed() ? null : pane.owner),
    getKeybindings,
    onCloseTab: () =>
      pane.owner.send('vscodeEditor:close', {
        paneId: vscodeWorkspaceId(pane.request.paneKey),
        path: pane.request.filePath,
        viewId: pane.request.viewId
      }),
    shouldForwardShortcut: (input) =>
      matchesGuestTabShortcut(input, process.platform, getKeybindings(), false) ||
      resolveWindowShortcutAction(input, process.platform, getKeybindings()) !== null
  })
}
const bridge = new VSCodeBridge(
  (id) => {
    void openConnectedFile(id).catch((cause: unknown) => {
      const pane = panes.get(id)
      if (pane && !pane.owner.isDestroyed()) {
        pane.owner.send('vscodeEditor:state', {
          type: 'state',
          paneId: id,
          path: pane.request.filePath,
          dirty: false,
          error: cause instanceof Error ? cause.message : 'VS Code could not open the file.'
        })
      }
    })
  },
  (state) => {
    const pane = panes.get(state.paneId)
    if (pane && state.active && isAbsolute(state.path) && !pane.paths.has(pathKey(state.path))) {
      const duplicate = [...panes.values()].some(
        (other) => other !== pane && other.paths.has(pathKey(state.path))
      )
      if (duplicate) {
        void openConnectedFile(state.paneId).catch(() => {})
        return
      }
      pane.paths.set(pathKey(state.path), state.path)
      pane.request = { ...pane.request, filePath: state.path }
    }
    const displayPath = pane?.paths.get(pathKey(state.path))
    if (pane && !pane.owner.isDestroyed() && displayPath) {
      pane.owner.send('vscodeEditor:state', { ...state, path: displayPath })
    }
  }
)

async function ensureRuntime(): Promise<void> {
  clearTimeout(idleStop)
  if (runtime) {
    return
  }
  if (!starting) {
    starting = (async () => {
      const endpoint = await bridge.listen()
      try {
        runtime = await startVSCodeRuntime(endpoint)
      } catch (error) {
        bridge.dispose()
        throw error
      }
      if (!quitHookInstalled) {
        app.once('will-quit', () => {
          clearTimeout(idleStop)
          bridge.dispose()
          runtime?.stop()
          runtime = null
        })
        quitHookInstalled = true
      }
    })().finally(() => {
      starting = null
    })
  }
  await starting
}

async function openConnectedFile(id: string): Promise<void> {
  const pane = panes.get(id)
  if (!pane) {
    return
  }
  await bridge.request(id, {
    op: 'open',
    path: pane.request.filePath,
    background: pane.request.background,
    foreground: pane.request.foreground,
    settings: JSON.parse(
      await readFile(join(app.getPath('userData'), 'vscode-editor/user/User/settings.json'), 'utf8')
    )
  })
}

export async function openVSCodeEditor(
  owner: WebContents,
  request: VSCodeEditorOpen
): Promise<VSCodeEditorHandle> {
  await ensureRuntime()
  if (!runtime || owner.isDestroyed()) {
    throw new Error('The editor closed during startup.')
  }
  const id = vscodeWorkspaceId(request.paneKey)
  for (const [otherId, pane] of panes) {
    if (otherId !== id && pane.paths.has(pathKey(request.filePath)) && !pane.owner.isDestroyed()) {
      throw new Error(
        'This file is already open in another VS Code pane. Use that pane to keep its unsaved changes together.'
      )
    }
  }
  const existing = panes.get(id)
  if (existing && existing.owner !== owner) {
    throw new Error('This editor belongs to another Orca window.')
  }
  if (existing) {
    existing.active = true
    existing.request = request
    installEditorShortcuts(existing)
    existing.paths.set(pathKey(request.filePath), request.filePath)
    if (bridge.connected(id) && existing.guest && !existing.guest.isDestroyed()) {
      await openConnectedFile(id)
      existing.paths.set(pathKey(request.filePath), request.filePath)
    }
    return { id, url: existing.url }
  }
  const directory = join(app.getPath('userData'), 'vscode-editor/workspaces')
  await mkdir(directory, { recursive: true })
  const workspace = join(directory, `${id}.code-workspace`)
  await writeFile(
    workspace,
    JSON.stringify({
      folders: [{ path: request.rootPath }],
      settings: VSCODE_EDITOR_PERFORMANCE_SETTINGS
    })
  )
  const url = new URL(runtime.origin)
  url.searchParams.set('tkn', runtime.token)
  url.searchParams.set('workspace', pathToFileURL(workspace).pathname)
  panes.set(id, {
    owner,
    request,
    paths: new Map([[pathKey(request.filePath), request.filePath]]),
    url: url.href,
    active: true
  })
  return { id, url: url.href }
}

export async function operateVSCodeEditor(
  owner: WebContents,
  id: string,
  filePath: string,
  op: 'save' | 'discard'
): Promise<void> {
  const pane = panes.get(id)
  if (!pane || pane.owner !== owner || !pane.paths.has(pathKey(filePath))) {
    throw new Error('This file is not owned by the editor.')
  }
  await bridge.request(id, { op, path: filePath })
  if (op === 'discard') {
    pane.paths.delete(pathKey(filePath))
  }
  if (op === 'save' && !owner.isDestroyed()) {
    const content =
      extname(filePath).toLowerCase() === '.ipynb' ? undefined : await readFile(filePath, 'utf8')
    owner.send('vscodeEditor:state', {
      type: 'state',
      paneId: id,
      path: filePath,
      dirty: false,
      ...(content === undefined ? {} : { content })
    })
  }
}

export function releaseVSCodeEditor(owner: WebContents, id: string): void {
  const pane = panes.get(id)
  if (pane?.owner === owner) {
    pane.active = false
    pane.paths.clear()
    clearTimeout(idleStop)
    idleStop = setTimeout(() => {
      if ([...panes.values()].some((pane) => pane.active)) {
        return
      }
      bridge.dispose()
      runtime?.stop()
      runtime = null
      panes.clear()
    }, 5000)
    idleStop.unref()
  }
  // Keep recovery ownership while VS Code flushes its own hot-exit backups after guest teardown.
}

export function isVSCodeEditorAttach(partition: string, src: string): boolean {
  return (
    partition === VSCODE_EDITOR_PARTITION &&
    [...panes.values()].some((pane) => pane.active && pane.url === src && !pane.owner.isDestroyed())
  )
}

export function attachVSCodeEditorGuest(guest: WebContents): boolean {
  if (guest.session !== session.fromPartition(VSCODE_EDITOR_PARTITION)) {
    return false
  }
  const origin = runtime?.origin
  guest.once('dom-ready', () => {
    const target = new URL(guest.getURL())
    const pane = [...panes.values()].find((pane) => {
      const url = new URL(pane.url)
      return (
        pane.active &&
        !pane.owner.isDestroyed() &&
        url.origin === target.origin &&
        url.searchParams.get('workspace') === target.searchParams.get('workspace')
      )
    })
    if (!pane) {
      return
    }
    pane.guest = guest
    installEditorShortcuts(pane)
    guest.once('destroyed', () => {
      if (pane.guest === guest) {
        pane.disposeShortcuts?.()
        delete pane.guest
      }
    })
  })
  guest.setWindowOpenHandler(({ url }) => {
    const external = normalizeExternalBrowserUrl(url)
    if (external) {
      void shell.openExternal(external)
    }
    return { action: 'deny' }
  })
  guest.on('will-navigate', (event, url) => {
    if (origin && new URL(url).origin === origin) {
      return
    }
    event.preventDefault()
  })
  return true
}
