#!/usr/bin/env node
// Builds the renderer, copies it into the installed Lamng Orca and proves the
// installed app renders it. The renderer lives in app.asar.unpacked, but Electron
// only serves unpacked files the asar header lists, so the header is re-synced.
// Never touches the running app; quit and reopen it to see changes.
import { execFileSync } from 'node:child_process'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'
import { listedFiles, syncUnpackedDir } from './lamng-sync-asar-header.mjs'

const repo = process.cwd()
const app = process.env.LAMNG_APP ?? join(homedir(), 'Applications/Orca-1.4.244-Lamng')
const asar = join(app, 'resources/app.asar')
const installed = join(app, 'resources/app.asar.unpacked/out/renderer')
const built = join(repo, 'out/renderer')
const label = process.argv[2] ?? 'renderer'
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const record = join(homedir(), '.local/state/lamng-installs', `${stamp}-${label}`)

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', ...opts })
const entryScript = (dir) =>
  /<script[^>]+src="([^"]+)"/.exec(readFileSync(join(dir, 'index.html'), 'utf8'))?.[1]

if (!existsSync(installed)) {
  throw new Error(`Installed renderer not found: ${installed}`)
}

run('pnpm', ['run', 'build:electron-vite'], { cwd: repo, stdio: 'ignore' })
const expectedEntry = entryScript(built)
if (!expectedEntry) {
  throw new Error('Built index.html has no entry script')
}

mkdirSync(record, { recursive: true })
cpSync(installed, join(record, 'renderer-before'), { recursive: true, reflink: true })
cpSync(asar, join(record, 'app.asar-before'), { reflink: true })
run('rsync', ['-a', `${built}/`, `${installed}/`])
await syncUnpackedDir(asar, 'out/renderer')

// Every file the built index references must now exist in the installed copy.
if (entryScript(installed) !== expectedEntry) {
  throw new Error('Installed index.html differs')
}
const listed = listedFiles(asar, 'out/renderer')
const referenced = [
  ...readFileSync(join(installed, 'index.html'), 'utf8').matchAll(
    /(?:src|href)="\.?\/?(assets\/[^"]+)"/g
  )
].map((m) => m[1])
const unlisted = referenced.filter(
  (path) => !listed.has(path) || !existsSync(join(installed, path))
)
if (unlisted.length > 0) {
  throw new Error(`Installed app cannot serve: ${unlisted.slice(0, 5).join(', ')}`)
}

// Hidden launch of the installed binary on a throwaway profile: it must load the new entry bundle.
const root = mkdtempSync(join(tmpdir(), 'lamng-install-'))
const { ELECTRON_RUN_AS_NODE: _drop, ...env } = process.env
let loaded
let rendered
const failed = []
const electronApp = await electron.launch({
  executablePath: join(app, 'orca-ide'),
  args: [
    '--no-sandbox',
    '--ozone-platform=headless',
    '--disable-gpu',
    `--user-data-dir=${join(root, 'profile')}`
  ],
  env: {
    ...env,
    HOME: root,
    XDG_CONFIG_HOME: join(root, 'config'),
    ORCA_BACKGROUND_LAUNCH: '1',
    ORCA_E2E_HEADLESS: '1'
  }
})
try {
  const page = await electronApp.firstWindow()
  page.on('requestfailed', (request) => failed.push(request.url()))
  await page.waitForLoadState('domcontentloaded')
  loaded = await page.evaluate(() => [...document.scripts].map((s) => s.src))
  // A script tag only proves index.html changed; an empty #root is the blank-window failure.
  rendered = await page
    .waitForFunction(() => document.getElementById('root')?.childElementCount > 0, null, {
      timeout: 30_000
    })
    .then(
      () => true,
      () => false
    )
} finally {
  await electronApp.close()
  rmSync(root, { recursive: true, force: true })
}
const hit =
  rendered &&
  failed.length === 0 &&
  loaded.some((src) => src.endsWith(expectedEntry.replace(/^\.?\//, '')))
writeFileSync(
  join(record, 'installation.json'),
  JSON.stringify(
    {
      app,
      built: stamp,
      expectedEntry,
      installedAppLoadsIt: hit,
      rendered,
      failedRequests: failed,
      rollback: `rsync -a --delete ${join(record, 'renderer-before')}/ ${installed}/ && cp ${join(record, 'app.asar-before')} ${asar}`
    },
    null,
    2
  )
)
if (!hit) {
  throw new Error(
    `Installed app did not render ${expectedEntry}; rendered: ${rendered}; failed: ${failed.slice(0, 5).join(', ')}; loaded: ${loaded.join(', ')}`
  )
}
console.log(
  `OK: installed app renders ${expectedEntry}. Record: ${record}\nQuit and reopen Orca to see it.`
)
