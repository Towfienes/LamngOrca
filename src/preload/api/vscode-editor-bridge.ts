import { ipcRenderer } from 'electron'
import type { VSCodeEditorApi, VSCodeEditorSnapshot } from '../../shared/vscode-editor'

export const vscodeEditorApi: VSCodeEditorApi = {
  onClose: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      request: Parameters<typeof callback>[0]
    ): void => callback(request)
    ipcRenderer.on('vscodeEditor:close', listener)
    return () => ipcRenderer.removeListener('vscodeEditor:close', listener)
  },
  available: () => ipcRenderer.invoke('vscodeEditor:available'),
  open: (request) => ipcRenderer.invoke('vscodeEditor:open', request),
  save: (request) => ipcRenderer.invoke('vscodeEditor:save', request),
  discard: (request) => ipcRenderer.invoke('vscodeEditor:discard', request),
  release: (id) => ipcRenderer.invoke('vscodeEditor:release', id),
  onState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: VSCodeEditorSnapshot): void =>
      callback(state)
    ipcRenderer.on('vscodeEditor:state', listener)
    return () => ipcRenderer.removeListener('vscodeEditor:state', listener)
  }
}
