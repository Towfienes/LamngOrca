import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import type { Store } from '../persistence'
import { vscodeEditorOpenSchema } from '../../shared/vscode-editor'
import { isTrustedBrowserRenderer } from './browser-renderer-trust'
import {
  resolveDesktopAuthorizedPath,
  resolveUserNamedRegularFile
} from './local-file-access-resolution'
import { vscodeRuntimeInstalled } from '../vscode-editor/vscode-runtime'
import {
  openVSCodeEditor,
  operateVSCodeEditor,
  releaseVSCodeEditor,
  setVSCodeEditorKeybindings
} from '../vscode-editor/vscode-editor-service'
import type { KeybindingService } from '../keybindings/keybinding-service'

function assertEditorSender(event: IpcMainInvokeEvent): void {
  if (!isTrustedBrowserRenderer(event.sender) || event.senderFrame !== event.sender.mainFrame) {
    throw new Error('Untrusted VS Code editor request.')
  }
}

export function registerVSCodeEditorHandlers(store: Store, keybindings?: KeybindingService): void {
  setVSCodeEditorKeybindings(() => keybindings?.getOverrides())
  ipcMain.handle('vscodeEditor:available', (event) => {
    assertEditorSender(event)
    return vscodeRuntimeInstalled()
  })
  ipcMain.handle('vscodeEditor:open', async (event, input: unknown) => {
    assertEditorSender(event)
    const request = vscodeEditorOpenSchema.parse(input)
    await resolveUserNamedRegularFile(request.filePath, store)
    const rootPath = await resolveDesktopAuthorizedPath(request.rootPath, store)
    return openVSCodeEditor(event.sender, { ...request, rootPath })
  })
  for (const op of ['save', 'discard'] as const) {
    ipcMain.handle(`vscodeEditor:${op}`, (event, input: unknown) => {
      assertEditorSender(event)
      const { id, filePath } = z.object({ id: z.string(), filePath: z.string() }).parse(input)
      return operateVSCodeEditor(event.sender, id, filePath, op)
    })
  }
  ipcMain.handle('vscodeEditor:release', (event, id: unknown) => {
    assertEditorSender(event)
    releaseVSCodeEditor(event.sender, z.string().parse(id))
  })
}
