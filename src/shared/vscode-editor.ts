import { z } from 'zod'

export const VSCODE_EDITOR_PARTITION = 'persist:orca-vscode-editor'

export const vscodeEditorOpenSchema = z.object({
  paneKey: z.string().min(1).max(4096),
  filePath: z.string().min(1).max(32768),
  rootPath: z.string().min(1).max(32768),
  background: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  foreground: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  viewId: z.string().optional()
})

export type VSCodeEditorOpen = z.infer<typeof vscodeEditorOpenSchema>
export type VSCodeEditorHandle = { id: string; url: string }
export const vscodeEditorSnapshotSchema = z.object({
  type: z.literal('state'),
  path: z.string(),
  dirty: z.boolean(),
  content: z.string().optional(),
  error: z.string().optional(),
  active: z.boolean().optional()
})
export type VSCodeEditorSnapshot = z.infer<typeof vscodeEditorSnapshotSchema> & {
  paneId: string
}

export type VSCodeEditorApi = {
  onClose: (
    callback: (request: { paneId: string; path: string; viewId?: string }) => void
  ) => () => void
  available: () => Promise<boolean>
  open: (request: VSCodeEditorOpen) => Promise<VSCodeEditorHandle>
  save: (args: { id: string; filePath: string }) => Promise<void>
  discard: (args: { id: string; filePath: string }) => Promise<void>
  release: (id: string) => Promise<void>
  onState: (callback: (state: VSCodeEditorSnapshot) => void) => () => void
}
