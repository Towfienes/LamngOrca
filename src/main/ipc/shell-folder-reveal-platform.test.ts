import { beforeEach, describe, expect, it, vi } from 'vitest'
import { dirname, resolve } from 'node:path'

const { handleMock, openPathMock, showItemInFolderMock } = vi.hoisted(() => ({
  handleMock: vi.fn(),
  openPathMock: vi.fn(),
  showItemInFolderMock: vi.fn()
}))

vi.mock('electron', () => ({
  ipcMain: { handle: handleMock },
  shell: { showItemInFolder: showItemInFolderMock, openExternal: vi.fn(), openPath: openPathMock },
  dialog: { showOpenDialog: vi.fn() }
}))

vi.mock('node:fs/promises', () => ({
  constants: { COPYFILE_EXCL: 1 },
  copyFile: vi.fn(),
  stat: vi.fn(async () => ({ isDirectory: () => true }))
}))

import { registerShellHandlers } from './shell'
import { pinProcessPlatform } from './pin-process-platform'

const store = {
  getSettings: () => ({ activeRuntimeEnvironmentId: null }),
  getSshTarget: () => undefined
}

function getHandler(channel: string): (event: unknown, ...args: unknown[]) => Promise<unknown> {
  registerShellHandlers(store as never)
  const call = handleMock.mock.calls.find((c: unknown[]) => c[0] === channel)
  if (!call) {
    throw new Error(`${channel} handler not registered`)
  }
  return call[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>
}

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform, configurable: true })
}

describe('folder reveal per platform', () => {
  pinProcessPlatform('linux')

  beforeEach(() => {
    handleMock.mockReset()
    openPathMock.mockReset().mockResolvedValue('')
    showItemInFolderMock.mockReset()
  })

  // Linux: FileManager1 can belong to a different app than the user's default folder handler.
  it.each(['shell:openPath', 'shell:openInFileManager'])(
    '%s respects the default Linux folder application instead of the active reveal service',
    async (channel) => {
      setPlatform('linux')
      const filePath = resolve('workspace', 'file.txt')
      await getHandler(channel)({}, filePath, 'local')
      expect(openPathMock).toHaveBeenCalledWith(dirname(filePath))
      expect(showItemInFolderMock).not.toHaveBeenCalled()
    }
  )

  it('reports failures from the default Linux folder application', async () => {
    setPlatform('linux')
    openPathMock.mockResolvedValueOnce('Could not launch file manager')
    await expect(
      getHandler('shell:openInFileManager')({}, resolve('workspace'), 'local')
    ).resolves.toEqual({
      ok: false,
      reason: 'launch-failed'
    })
  })

  it('preserves Windows reveal behavior', async () => {
    setPlatform('win32')
    const workspacePath = resolve('workspace')
    await expect(
      getHandler('shell:openInFileManager')({}, workspacePath, 'local')
    ).resolves.toEqual({
      ok: true
    })
    expect(showItemInFolderMock).toHaveBeenCalledWith(workspacePath)
    expect(openPathMock).not.toHaveBeenCalled()
  })
})
