import { useLayoutEffect, type ReactNode } from 'react'
import { useAppStore } from '@/store'
import { getRuntimeTargetForFileOwner } from '@/lib/file-owner-runtime-target'
import { getConnectionIdForFileFromState } from '@/lib/connection-owner-resolution'
import { filePreviewForPath } from '../../../../shared/file-preview-kind'
import { selectWorkspaceByHostTarget } from '@/store/workspace-record-selectors'
import { vscodeEditorSessions, isVSCodeSourceDocument } from './vscode-editor-sessions'
import { hostWorktreeTarget } from '../../../../shared/worktree/host-qualified-identity'
import { useVSCodeEditorPanes } from './vscode-editor-panes'
import { translate } from '@/i18n/i18n'
import { useVSCodeEditorAvailability } from './use-vscode-editor-availability'

function SelectVSCodePane({
  file,
  groupId,
  viewId,
  rootPath
}: {
  file: NonNullable<ReturnType<typeof useAppStore.getState>['openFiles'][number]>
  groupId: string
  viewId: string
  rootPath: string
}): null {
  useLayoutEffect(() => {
    useVSCodeEditorPanes
      .getState()
      .select({ file, groupId, viewId, rootPath, paneKey: `${file.worktreeId}\0${groupId}` })
  }, [file, groupId, viewId, rootPath])
  return null
}

export function VSCodeEditorRoute({
  activeFileId,
  activeViewStateId,
  fallback
}: {
  activeFileId?: string | null
  activeViewStateId?: string | null
  fallback: ReactNode
}): ReactNode {
  const file = useAppStore((state) =>
    state.openFiles.find((file) => file.id === (activeFileId ?? state.activeFileId))
  )
  const installed = useVSCodeEditorAvailability()
  const nativePath = useVSCodeEditorPanes((state) =>
    file ? state.nativePaths.has(file.filePath) : false
  )
  if (
    !file ||
    file.mode !== 'edit' ||
    file.readOnly ||
    file.isUntitled ||
    file.conflict ||
    file.externalSshTargetId ||
    nativePath ||
    !isVSCodeSourceDocument(file)
  ) {
    return fallback
  }
  const preview = filePreviewForPath(file.filePath)
  if (preview) {
    return fallback
  }
  const state = useAppStore.getState()
  if (
    getRuntimeTargetForFileOwner(state, file.worktreeId, file.runtimeEnvironmentId)?.kind !==
      'local' ||
    getConnectionIdForFileFromState(state, file.worktreeId, file.filePath)
  ) {
    return fallback
  }
  if (file.isDirty && !vscodeEditorSessions.has(file.filePath)) {
    return fallback
  }
  const workspace = selectWorkspaceByHostTarget(
    state,
    hostWorktreeTarget({ id: file.worktreeId, hostId: 'local' })
  )
  if (!workspace || installed === false) {
    return fallback
  }
  if (installed === null) {
    return (
      <div className="p-4 text-sm text-muted-foreground">
        {translate('auto.components.editor.EditorPanelShell.e2c4dec350', 'Loading editor...')}
      </div>
    )
  }
  const groupId = state.unifiedTabsByWorktree[file.worktreeId]?.find(
    (tab) => tab.id === activeViewStateId
  )?.groupId
  if (!groupId) {
    return fallback
  }
  return (
    <SelectVSCodePane
      file={file}
      groupId={groupId}
      viewId={activeViewStateId ?? file.id}
      rootPath={workspace.path}
    />
  )
}
