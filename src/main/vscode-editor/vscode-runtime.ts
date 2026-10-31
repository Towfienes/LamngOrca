import { app } from 'electron'
import { spawnProcess } from '@orca/process-host'
import { forceTerminateProcessTree } from '@orca/process-host/process-tree-termination'
import { randomBytes } from 'node:crypto'
import { access, copyFile, cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, isAbsolute } from 'node:path'
import { parse, type ParseError } from 'jsonc-parser'
import { z } from 'zod'
import bridgeSource from '../../../resources/vscode-editor-bridge/extension.cjs?asset&asarUnpack'
import bridgeManifest from '../../../resources/vscode-editor-bridge/package.json?asset&asarUnpack'
import { applyVSCodeEditorPerformanceSettings, buildVSCodeEditorSettings } from './vscode-profile'
import { writeFileAtomically } from '../codex-accounts/fs-utils'

const runtimeManifestSchema = z.object({ serverDirectory: z.string().refine(isAbsolute) })

export function vscodeRuntimeDirectory(): string {
  return process.env.ORCA_VSCODE_RUNTIME_DIR || join(app.getPath('appData'), 'orca-vscode')
}

export async function vscodeRuntimeInstalled(): Promise<boolean> {
  try {
    await readRuntimeManifest()
    return true
  } catch {
    return false
  }
}

async function readRuntimeManifest(): Promise<string> {
  const manifest = runtimeManifestSchema.parse(
    JSON.parse(await readFile(join(vscodeRuntimeDirectory(), 'runtime.json'), 'utf8'))
  )
  await access(join(manifest.serverDirectory, `node${process.platform === 'win32' ? '.exe' : ''}`))
  await access(join(manifest.serverDirectory, 'out/server-main.js'))
  return manifest.serverDirectory
}

export async function prepareVSCodeProfile(): Promise<string> {
  const directory = join(app.getPath('userData'), 'vscode-editor')
  const userDirectory = join(directory, 'user/User')
  await mkdir(userDirectory, { recursive: true })
  const settingsPath = join(userDirectory, 'settings.json')
  try {
    await access(settingsPath)
  } catch {
    let settings: Record<string, unknown> = {}
    try {
      const source: unknown = parse(
        await readFile(join(vscodeRuntimeDirectory(), 'settings.json'), 'utf8').catch(() =>
          readFile(join(app.getPath('appData'), 'Code/User/settings.json'), 'utf8')
        )
      )
      settings = z.record(z.string(), z.unknown()).parse(source)
    } catch {
      /* A standalone installation also works without a desktop VS Code profile. */
    }
    await writeFile(settingsPath, JSON.stringify(buildVSCodeEditorSettings(settings), null, 2))
  }
  const saved = await readFile(settingsPath, 'utf8')
  const errors: ParseError[] = []
  const existing = z.record(z.string(), z.unknown()).parse(parse(saved, errors))
  if (errors.length > 0) {
    throw new Error(
      'The embedded VS Code settings contain invalid JSON. Repair them before opening the editor.'
    )
  }
  const upgraded = applyVSCodeEditorPerformanceSettings(existing)
  if (JSON.stringify(existing) !== JSON.stringify(upgraded)) {
    writeFileAtomically(settingsPath, JSON.stringify(upgraded, null, 2), { mode: 0o600 })
  }
  const extensionDirectory = join(directory, 'extensions/orca-local.orca-editor-bridge-0.1.0')
  const seed = join(vscodeRuntimeDirectory(), 'extensions')
  for (const entry of await readdir(seed).catch(() => [])) {
    const destination = join(directory, 'extensions', entry)
    try {
      await access(destination)
    } catch {
      await cp(join(seed, entry), destination, { recursive: true, force: false })
    }
  }
  await mkdir(extensionDirectory, { recursive: true })
  await copyFile(bridgeSource, join(extensionDirectory, 'extension.cjs'))
  await copyFile(bridgeManifest, join(extensionDirectory, 'package.json'))
  return directory
}

export async function startVSCodeRuntime(
  bridgeEndpoint: string
): Promise<{ origin: string; token: string; stop: () => void }> {
  const serverDirectory = await readRuntimeManifest()
  const directory = await prepareVSCodeProfile()
  const token = randomBytes(32).toString('hex')
  const tokenPath = join(directory, 'connection-token')
  await writeFile(tokenPath, token, { mode: 0o600 })
  const child = spawnProcess({
    program: join(serverDirectory, `node${process.platform === 'win32' ? '.exe' : ''}`),
    args: [
      join(serverDirectory, 'out/server-main.js'),
      '--start-server',
      '--reconnection-grace-time',
      '5',
      '--host',
      '127.0.0.1',
      '--port',
      '0',
      '--connection-token-file',
      tokenPath,
      '--accept-server-license-terms',
      '--disable-telemetry',
      '--user-data-dir',
      join(directory, 'user'),
      '--extensions-dir',
      join(directory, 'extensions')
    ],
    env: { ...process.env, ORCA_VSCODE_BRIDGE: bridgeEndpoint },
    cwd: directory,
    detached: process.platform !== 'win32'
  })
  const stop = (): void => {
    void forceTerminateProcessTree(child)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const port = await new Promise<number>((resolve, reject) => {
      let tail = ''
      timer = setTimeout(() => reject(new Error('VS Code server did not start in time.')), 60_000)
      child.stdout.on('data', (chunk: Buffer) => {
        tail = (tail + chunk.toString()).slice(-8000)
        const match = /Extension host agent listening on (?:127\.0\.0\.1:)?(\d+)/.exec(tail)
        if (match) {
          resolve(Number(match[1]))
        }
      })
      child.stderr.resume()
      child.once('error', reject)
      child.once('exit', () => reject(new Error('VS Code server stopped during startup.')))
    })
    return { origin: `http://127.0.0.1:${port}`, token, stop }
  } catch (error) {
    stop()
    throw error
  } finally {
    clearTimeout(timer)
  }
}
