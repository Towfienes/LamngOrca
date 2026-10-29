import { afterEach, describe, expect, it, vi } from 'vitest'
import * as files from '@/runtime/runtime-file-read-client'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../../shared/constants'
import { readPinnedPrompt } from './pinned-prompt-read'

const pin = {
  filePath: '/prompts/review.md',
  relativePath: 'review.md',
  worktreeId: FLOATING_TERMINAL_WORKTREE_ID
}

afterEach(() => vi.restoreAllMocks())

describe('reading pinned prompts', () => {
  it('reads fresh text each time without trimming or caching it', async () => {
    const read = vi
      .spyOn(files, 'readRuntimeFileContent')
      .mockResolvedValueOnce({ content: ' First\n', isBinary: false })
      .mockResolvedValueOnce({ content: ' Second\n', isBinary: false })
    await expect(readPinnedPrompt(pin, { kind: 'local' })).resolves.toBe(' First\n')
    await expect(readPinnedPrompt(pin, { kind: 'local' })).resolves.toBe(' Second\n')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('rejects a changed execution host before reading any file', async () => {
    const read = vi.spyOn(files, 'readRuntimeFileContent')
    await expect(readPinnedPrompt(pin, { kind: 'ssh', connectionId: 'other' })).rejects.toThrow()
    expect(read).not.toHaveBeenCalled()
  })

  it('does not offer binary contents or hide read failures', async () => {
    const read = vi
      .spyOn(files, 'readRuntimeFileContent')
      .mockResolvedValueOnce({ content: 'binary', isBinary: true })
      .mockRejectedValueOnce(new Error('File is missing'))
    await expect(readPinnedPrompt(pin, { kind: 'local' })).rejects.toThrow('plain text')
    await expect(readPinnedPrompt(pin, { kind: 'local' })).rejects.toThrow('File is missing')
    expect(read).toHaveBeenCalledTimes(2)
  })
})
