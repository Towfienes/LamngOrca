import type { Store } from '../../persistence/loading-store/store'
import type { KeybindingService } from '../../keybindings/keybinding-service'
import { registerNotebookHandlers } from '../notebook'
import { registerVSCodeEditorHandlers } from '../vscode-editor'

export function registerWorkspaceEditorHandlers(
  store: Store,
  keybindings?: KeybindingService
): void {
  registerNotebookHandlers(store)
  registerVSCodeEditorHandlers(store, keybindings)
}
