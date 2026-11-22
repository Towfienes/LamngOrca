#!/usr/bin/env node
// Hidden smoke test of an installed Lamng build: throwaway profile, no window shown.
// Usage: lamng-installed-smoke.mjs <app-dir> <expected-version>
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { _electron as electron } from '@playwright/test'

const [appDir, expected] = process.argv.slice(2)
if (!appDir || !expected) {
  console.error('usage: lamng-installed-smoke.mjs <app-dir> <expected-version>')
  process.exit(2)
}
const userData = mkdtempSync(join(tmpdir(), 'lamng-smoke-'))
const app = await electron.launch({
  executablePath: join(appDir, 'orca-ide'),
  args: ['--no-sandbox', `--user-data-dir=${userData}`],
  env: {
    ...process.env,
    ORCA_E2E_HEADLESS: '1',
    ORCA_BACKGROUND_LAUNCH: '1',
    ORCA_USER_DATA_PATH: userData
  },
  timeout: 90_000
})
try {
  const page = await app.firstWindow()
  await page.waitForLoadState('domcontentloaded')
  await page.waitForFunction(() => document.body.innerText.trim().length > 20, null, {
    timeout: 60_000
  })
  const version = await app.evaluate(({ app: a }) => a.getVersion())
  const text = await page.evaluate(() => document.body.innerText.slice(0, 400))
  const failures = []
  if (version !== expected) {
    failures.push(`version ${version} != ${expected}`)
  }
  if (/something went wrong/i.test(text)) {
    failures.push('renderer error boundary shown')
  }
  console.log(JSON.stringify({ version, ok: failures.length === 0, failures }))
  process.exitCode = failures.length ? 1 : 0
} finally {
  await app.close()
  rmSync(userData, { recursive: true, force: true })
}
