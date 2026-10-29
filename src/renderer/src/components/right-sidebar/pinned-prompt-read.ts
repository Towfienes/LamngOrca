import { readRuntimeFileContent } from '@/runtime/runtime-file-read-client'
import { captureFileExplorerOperationGuard } from './file-explorer-operation-owner'
import type { FileExplorerOperationOwner } from './file-explorer-types'
import { isPromptFile, type PinnedPrompt } from './pinned-prompts'

export async function readPinnedPrompt(
  pin: PinnedPrompt,
  owner: FileExplorerOperationOwner
): Promise<string> {
  if (!isPromptFile(pin.filePath)) {
    throw new Error('Choose a .md or .txt file.')
  }
  const guard = captureFileExplorerOperationGuard(pin.worktreeId, owner)
  const result = await readRuntimeFileContent({ ...guard.route, ...pin })
  guard.assertCurrent()
  if (result.isBinary || result.isImage) {
    throw new Error('This file does not contain plain text.')
  }
  return result.content
}
