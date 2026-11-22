import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAppEnvironment } from '../../shared/app-environment'
import type { ProviderRateLimits } from '../../shared/rate-limit-types'
import { fetchAntigravityRateLimits } from '../rate-limits/antigravity-usage-fetcher'
import { hostShellEnvironment } from '../runtime/structured-agent-shell-environment'
import type { AntigravityAccountService } from './native-account-service'

type Fetcher = typeof fetchAntigravityRateLimits

// agy keeps its token in a private file instead of the OS keyring on SSH hosts. Each saved
// account gets its own probe HOME in that mode, so its quota is read without switching the
// native account. The token file exists only while the probe runs.
const FILE_STORAGE_ENV = { SSH_CONNECTION: '127.0.0.1 0 127.0.0.1 0' }

export function getAntigravityUsageProbeRoot(): string {
  return join(getAppEnvironment().getPath('userData'), 'antigravity-accounts', 'usage-homes')
}

let inflight: Promise<Record<string, ProviderRateLimits>> | null = null

export function fetchInactiveAntigravityUsage(
  service: AntigravityAccountService,
  root = getAntigravityUsageProbeRoot(),
  fetcher: Fetcher = fetchAntigravityRateLimits
): Promise<Record<string, ProviderRateLimits>> {
  inflight ??= probeAll(service, root, fetcher).finally(() => {
    inflight = null
  })
  return inflight
}

async function probeAll(
  service: AntigravityAccountService,
  root: string,
  fetcher: Fetcher
): Promise<Record<string, ProviderRateLimits>> {
  if (process.platform === 'win32') {
    return {}
  }
  const results: Record<string, ProviderRateLimits> = {}
  // Sequential: each probe starts an agy process.
  for (const { id, credentials } of await service.inactiveCredentials()) {
    if (!/^[\w-]+$/.test(id)) {
      continue
    }
    const home = join(root, id)
    const dir = join(home, '.gemini', 'antigravity-cli')
    const tokenPath = join(dir, 'antigravity-oauth-token')
    try {
      mkdirSync(dir, { recursive: true, mode: 0o700 })
      chmodSync(home, 0o700)
      writeFileSync(tokenPath, credentials, { mode: 0o600 })
      chmodSync(tokenPath, 0o600)
      results[id] = await fetcher({
        resolveEnvironment: async () => ({
          ...(await hostShellEnvironment()),
          HOME: home,
          USERPROFILE: home,
          ...FILE_STORAGE_ENV
        })
      })
      if (existsSync(tokenPath)) {
        await service.updateInactiveCredential(id, credentials, readFileSync(tokenPath, 'utf8'))
      }
    } catch {
      results[id] = {
        provider: 'antigravity',
        session: null,
        weekly: null,
        updatedAt: Date.now(),
        error: 'Antigravity usage could not be read for this saved account.',
        status: 'error'
      }
    } finally {
      rmSync(tokenPath, { force: true })
    }
  }
  return results
}
