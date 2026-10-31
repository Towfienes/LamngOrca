import { useAppStore } from '@/store'
import type { AppState } from '@/store'
import type { OpenFile } from '@/store/slices/editor'
import { getRuntimeTargetForFileOwner } from '@/lib/file-owner-runtime-target'
import { getConnectionIdForFileFromState } from '@/lib/connection-owner-resolution'
import { dispatchWorkspaceTabCommand } from '@/lib/workspace-tab-commands'
import { basename, getRelativePathInsideRoot } from '@/lib/path'
import { detectLanguage } from '@/lib/language-detect'
import { useVSCodeEditorPanes } from './vscode-editor-panes'
import { parseWorkspaceKey } from '../../../../shared/workspace-scope'
import { ORCA_EDITOR_FILE_SAVED_EVENT, type EditorFileSavedDetail } from './editor-autosave'

export const vscodeEditorSessions = new Map<string, { id: string }>()
export const vscodeEditorContexts = new Map<
  string,
  { worktreeId: string; groupId: string; rootPath: string; filePath: string }
>()
let subscribed = false

export function isVSCodeSourceDocument(file: Pick<OpenFile, 'language' | 'filePath'>): boolean {
  return (
    (file.language !== 'markdown' && file.language !== 'csv') ||
    vscodeEditorSessions.has(file.filePath)
  )
}

export function subscribeVSCodeEditorState(): void {
  if (subscribed) {
    return
  }
  subscribed = true
  useAppStore.subscribe((state, previous) => {
    if (state.openFiles === previous.openFiles) {
      return
    }
    const remaining = new Set(state.openFiles.map((file) => file.id))
    for (const file of previous.openFiles) {
      if (remaining.has(file.id)) {
        continue
      }
      const session = vscodeSessionForFile(previous, file)
      if (!session) {
        continue
      }
      if (
        state.openFiles.some(
          (other) =>
            other.filePath === file.filePath &&
            vscodeSessionForFile(state, other)?.id === session.id
        )
      ) {
        continue
      }
      void window.api.vscodeEditor
        .discard({ id: session.id, filePath: file.filePath })
        .then(() => {
          const latest = useAppStore.getState()
          const reopened = latest.openFiles.some(
            (other) =>
              other.filePath === file.filePath &&
              vscodeSessionForFile(latest, other)?.id === session.id
          )
          if (!reopened && vscodeEditorSessions.get(file.filePath)?.id === session.id) {
            vscodeEditorSessions.delete(file.filePath)
          }
        })
        .catch((error: unknown) =>
          console.error('[editor] VS Code could not close the document', error)
        )
    }
  })
  window.api.vscodeEditor.onClose((request) => {
    const state = useAppStore.getState()
    const file = state.openFiles.find(
      (file) =>
        file.filePath === request.path && vscodeSessionForFile(state, file)?.id === request.paneId
    )
    if (!file) {
      return
    }
    const tabs = state.unifiedTabsByWorktree[file.worktreeId] ?? []
    const tab =
      tabs.find((tab) => tab.entityId === file.id && tab.id === request.viewId) ??
      tabs.find((tab) => tab.entityId === file.id)
    if (tab) {
      dispatchWorkspaceTabCommand({
        type: 'close',
        target: { kind: 'tab', worktreeId: file.worktreeId, tabId: tab.id }
      })
    }
  })
  window.api.vscodeEditor.onState((snapshot) => {
    if (snapshot.error) {
      return
    }
    const state = useAppStore.getState()
    const context = vscodeEditorContexts.get(snapshot.paneId)
    if (
      snapshot.active &&
      context &&
      state.activeWorktreeId === context.worktreeId &&
      context.filePath !== snapshot.path
    ) {
      const protectedDraft = state.openFiles.find(
        (file) =>
          file.filePath === snapshot.path &&
          file.isDirty &&
          canUseLocalVSCodeFile(state, file) &&
          !vscodeEditorSessions.has(file.filePath)
      )
      if (protectedDraft) {
        const scope = parseWorkspaceKey(protectedDraft.worktreeId)
        if (scope?.type === 'folder') {
          state.setActiveFolderWorkspace(scope.folderWorkspaceId)
        } else {
          state.setActiveWorktree(protectedDraft.worktreeId)
        }
        state.openFile({
          filePath: protectedDraft.filePath,
          relativePath: protectedDraft.relativePath,
          worktreeId: protectedDraft.worktreeId,
          runtimeEnvironmentId: null,
          language: protectedDraft.language,
          mode: 'edit'
        })
        return
      }
      if (useVSCodeEditorPanes.getState().nativePaths.has(snapshot.path)) {
        context.filePath = snapshot.path
        const relativePath =
          getRelativePathInsideRoot(snapshot.path, context.rootPath) ?? basename(snapshot.path)
        state.openFile({
          filePath: snapshot.path,
          relativePath,
          worktreeId: context.worktreeId,
          runtimeEnvironmentId: null,
          language: detectLanguage(relativePath),
          mode: 'edit'
        })
        return
      }
      vscodeEditorSessions.set(snapshot.path, { id: snapshot.paneId })
      context.filePath = snapshot.path
      state.focusGroup(context.worktreeId, context.groupId)
      const relativePath =
        getRelativePathInsideRoot(snapshot.path, context.rootPath) ?? basename(snapshot.path)
      state.openFile({
        filePath: snapshot.path,
        relativePath,
        worktreeId: context.worktreeId,
        runtimeEnvironmentId: null,
        language: detectLanguage(relativePath),
        mode: 'edit'
      })
    }
    for (const file of useAppStore.getState().openFiles) {
      if (
        file.filePath !== snapshot.path ||
        !isVSCodeSourceDocument(file) ||
        vscodeSessionForFile(state, file)?.id !== snapshot.paneId
      ) {
        continue
      }
      vscodeEditorSessions.set(file.filePath, { id: snapshot.paneId })
      if (snapshot.dirty) {
        if (snapshot.content !== undefined) {
          state.setEditorDraft(file.id, snapshot.content)
        }
        state.markFileDirty(file.id, true)
      } else {
        state.clearEditorDraft(file.id)
        state.markFileDirty(file.id, false)
        if (snapshot.content !== undefined) {
          window.dispatchEvent(
            new CustomEvent<EditorFileSavedDetail>(ORCA_EDITOR_FILE_SAVED_EVENT, {
              detail: { fileId: file.id, content: snapshot.content }
            })
          )
        }
      }
    }
  })
}

export function canUseLocalVSCodeFile(state: AppState, file: OpenFile): boolean {
  if (
    file.mode !== 'edit' ||
    file.readOnly ||
    file.externalSshTargetId ||
    getRuntimeTargetForFileOwner(state, file.worktreeId, file.runtimeEnvironmentId)?.kind !==
      'local' ||
    getConnectionIdForFileFromState(state, file.worktreeId, file.filePath)
  ) {
    return false
  }
  return true
}

export function vscodeSessionForFile(state: AppState, file: OpenFile): { id: string } | undefined {
  return canUseLocalVSCodeFile(state, file) ? vscodeEditorSessions.get(file.filePath) : undefined
}

export async function saveVSCodeEditorFile(state: AppState, file: OpenFile): Promise<boolean> {
  const session = vscodeSessionForFile(state, file)
  if (!session) {
    return false
  }
  await window.api.vscodeEditor.save({ id: session.id, filePath: file.filePath })
  return true
}

export async function discardVSCodeEditorFile(state: AppState, file: OpenFile): Promise<void> {
  const session = vscodeSessionForFile(state, file)
  if (!session) {
    return
  }
  await window.api.vscodeEditor.discard({ id: session.id, filePath: file.filePath })
  vscodeEditorSessions.delete(file.filePath)
}
