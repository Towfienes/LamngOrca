import { lazy, Suspense, useEffect, useCallback } from 'react'
import { useAppStore } from '@/store'
import { RetainedPaneHost } from '../tab-group/RetainedPaneHost'
import { useVSCodeEditorPanes, type VSCodePaneSelection } from './vscode-editor-panes'
import { vscodeEditorSessions } from './vscode-editor-sessions'

const VSCodeEditor = lazy(() => import('./VSCodeEditor'))

function VSCodeEditorOverlay({
  pane,
  activeWorkspace
}: {
  pane: VSCodePaneSelection
  activeWorkspace: string | null
}): React.JSX.Element | null {
  const file =
    useAppStore((state) => state.openFiles.find((file) => file.id === pane.file.id)) ?? pane.file
  const nativePaths = useVSCodeEditorPanes((state) => state.nativePaths)
  const hasOpenFiles = useAppStore((state) =>
    state.openFiles.some(
      (file) => pane.fileIds.includes(file.id) && !nativePaths.has(file.filePath)
    )
  )
  const visible = useAppStore(
    (state) =>
      state.groupsByWorktree[pane.file.worktreeId]?.find((group) => group.id === pane.groupId)
        ?.activeTabId === pane.viewId
  )
  const nativePath = nativePaths.has(file.filePath)
  const focusGroup = useAppStore((state) => state.focusGroup)
  const focus = useCallback(
    (groupId: string) => focusGroup(pane.file.worktreeId, groupId),
    [focusGroup, pane.file.worktreeId]
  )
  useEffect(() => {
    if (!hasOpenFiles) {
      useVSCodeEditorPanes.getState().remove(pane.paneKey)
    }
  }, [hasOpenFiles, pane.paneKey])
  if (!hasOpenFiles) {
    return null
  }
  return (
    <RetainedPaneHost
      groupId={pane.groupId}
      isVisible={!nativePath && visible && activeWorkspace === pane.file.worktreeId}
      onFocusOwningGroup={focus}
    >
      <Suspense fallback={null}>
        <VSCodeEditor
          file={file}
          paneKey={pane.paneKey}
          rootPath={pane.rootPath}
          viewId={pane.viewId}
          groupId={pane.groupId}
          onUseOrca={() => {
            vscodeEditorSessions.delete(file.filePath)
            useVSCodeEditorPanes.getState().useOrca(file.filePath)
          }}
        />
      </Suspense>
    </RetainedPaneHost>
  )
}

export function VSCodeEditorOverlayLayer({
  activeWorkspace
}: {
  activeWorkspace: string | null
}): React.JSX.Element {
  const panes = useVSCodeEditorPanes((state) => state.panes)
  return (
    <>
      {Object.values(panes).map((pane) => (
        <VSCodeEditorOverlay key={pane.paneKey} pane={pane} activeWorkspace={activeWorkspace} />
      ))}
    </>
  )
}
