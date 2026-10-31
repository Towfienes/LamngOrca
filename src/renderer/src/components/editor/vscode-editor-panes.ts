import { create } from 'zustand'
import type { OpenFile } from '@/store/slices/editor'

export type VSCodePaneSelection = {
  paneKey: string
  groupId: string
  file: OpenFile
  viewId: string
  rootPath: string
  fileIds: readonly string[]
}

export const useVSCodeEditorPanes = create<{
  panes: Record<string, VSCodePaneSelection>
  nativePaths: ReadonlySet<string>
  useOrca: (filePath: string) => void
  select: (pane: Omit<VSCodePaneSelection, 'fileIds'>) => void
  remove: (paneKey: string) => void
}>((set) => ({
  panes: {},
  nativePaths: new Set(),
  useOrca: (filePath) =>
    set((state) => ({ nativePaths: new Set([...state.nativePaths, filePath]) })),
  select: (pane) =>
    set((state) => ({
      panes: {
        ...state.panes,
        [pane.paneKey]: {
          ...pane,
          fileIds: [...new Set([...(state.panes[pane.paneKey]?.fileIds ?? []), pane.file.id])]
        }
      }
    })),
  remove: (paneKey) =>
    set((state) => {
      const panes = { ...state.panes }
      delete panes[paneKey]
      return { panes }
    })
}))
