import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { parse } from 'jsonc-parser'
import { buildVSCodeEditorSettings } from '../../src/main/vscode-editor/vscode-profile.ts'

const serverDirectory = process.argv[2]
if (!serverDirectory) {
  throw new Error(
    'Pass the directory of an official VS Code Web server installed by code serve-web.'
  )
}
await readFile(join(serverDirectory, 'product.json'))
const appData =
  process.platform === 'win32'
    ? process.env.APPDATA
    : process.platform === 'darwin'
      ? join(homedir(), 'Library/Application Support')
      : process.env.XDG_CONFIG_HOME || join(homedir(), '.config')
if (!appData) {
  throw new Error('The application data directory is unavailable.')
}
const directory = process.env.ORCA_VSCODE_RUNTIME_DIR || join(appData, 'orca-vscode')
await mkdir(join(directory, 'extensions'), { recursive: true })
const settings = parse(
  await readFile(join(appData, 'Code/User/settings.json'), 'utf8').catch(() => '{}')
)
await writeFile(
  join(directory, 'settings.json'),
  JSON.stringify(buildVSCodeEditorSettings(settings), null, 2)
)
const extensions = join(homedir(), '.vscode/extensions')
for (const name of await readdir(extensions)) {
  if (!/^(ms-python\.|ms-toolsai\.)/.test(name)) {
    continue
  }
  await cp(join(extensions, name), join(directory, 'extensions', name), {
    recursive: true,
    force: false
  })
}
const theme = (await readdir(extensions)).find((name) =>
  name.startsWith('soramanew.caelestia-vscode-integration-')
)
if (theme) {
  const destination = join(directory, 'extensions/orca-local.caelestia-theme-0.1.0')
  await mkdir(destination, { recursive: true })
  await cp(join(extensions, theme, 'themes'), join(destination, 'themes'), { recursive: true })
  await writeFile(
    join(destination, 'package.json'),
    JSON.stringify({
      name: 'caelestia-theme',
      publisher: 'orca-local',
      displayName: 'Caelestia (Orca)',
      version: '0.1.0',
      engines: { vscode: '^1.100.0' },
      contributes: {
        themes: [{ label: 'Caelestia', uiTheme: 'vs-dark', path: './themes/caelestia.json' }]
      }
    })
  )
}
await writeFile(
  join(directory, 'runtime.json'),
  JSON.stringify({ serverDirectory: resolve(serverDirectory) }, null, 2)
)
console.log(
  'Prepared official VS Code runtime and Python/Jupyter extensions for Orca. Desktop VS Code settings were not modified.'
)
