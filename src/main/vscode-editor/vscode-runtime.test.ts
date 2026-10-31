import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const state = vi.hoisted(() => ({ directory: '' }))
vi.mock('electron', () => ({ app: { getPath: () => state.directory } }))
vi.mock('../../../resources/vscode-editor-bridge/extension.cjs?asset&asarUnpack', () => ({
  default: join(process.cwd(), 'resources/vscode-editor-bridge/extension.cjs')
}))
vi.mock('../../../resources/vscode-editor-bridge/package.json?asset&asarUnpack', () => ({
  default: join(process.cwd(), 'resources/vscode-editor-bridge/package.json')
}))

import { prepareVSCodeProfile } from './vscode-runtime'

beforeEach(async () => {
  state.directory = await mkdtemp(join(tmpdir(), 'orca-vscode-migrate-'))
  await mkdir(join(state.directory, 'vscode-editor/user/User'), { recursive: true })
})
afterEach(async () => rm(state.directory, { recursive: true, force: true }))

it('upgrades existing profiles in place and keeps unrelated configuration and editor appearance', async () => {
  const path = join(state.directory, 'vscode-editor/user/User/settings.json')
  await writeFile(
    path,
    JSON.stringify({
      'editor.fontFamily': 'Dank Mono',
      'customExtension.setting': 'keep',
      'claudeCode.selectedModel': 'keep',
      'python.analysis.languageServerMode': 'full'
    })
  )
  await prepareVSCodeProfile()
  expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
    'editor.fontFamily': 'Dank Mono',
    'customExtension.setting': 'keep',
    'claudeCode.selectedModel': 'keep',
    'python.languageServer': 'None'
  })
})

it('refuses to overwrite a damaged existing settings file', async () => {
  const path = join(state.directory, 'vscode-editor/user/User/settings.json')
  const damaged = '{"customExtension.setting":"keep",'
  await writeFile(path, damaged)
  await expect(prepareVSCodeProfile()).rejects.toThrow('invalid JSON')
  expect(await readFile(path, 'utf8')).toBe(damaged)
})
