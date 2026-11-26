import { ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { DeeprelayModel, DeeprelayModelList } from '../../shared/deeprelay-models'
import type { AiVaultSession } from '../../shared/ai-vault/contracts/ai-vault-types'
import { listClaudeProfileSessions } from './claude-profile-sessions'

export function deeprelayPaths(home = homedir()): {
  envFile: string
  modelsCache: string
  projects: string
} {
  const profile = join(home, '.claude-deeprelay')
  return {
    envFile: join(home, '.local', 'lib', 'deeprelay', 'env.json'),
    modelsCache: join(home, '.cache', 'deeprelay', 'models.json'),
    projects: join(profile, 'projects')
  }
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

function shortModelId(id: string): string {
  return id.replace(/^deeprelay\//, '')
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * The configured model plus the launcher's cached plan probe. Why no live probe here: the
 * launcher probes the API itself before every start, and a picker row must stay instant.
 */
export function buildDeeprelayModelList(
  config: unknown,
  cache: unknown,
  now = Date.now()
): DeeprelayModelList {
  const cfg = config as { base?: unknown; model?: unknown } | null
  const model = typeof cfg?.model === 'string' ? cfg.model.trim() : ''
  if (!model) {
    return { available: false, reason: 'DeepRelay is not configured', fetchedAt: now }
  }
  const cached = cache as { at?: unknown; usable?: unknown } | null
  const cachedModels: DeeprelayModel[] = Array.isArray(cached?.usable)
    ? cached.usable
        .filter(
          (entry): entry is { id: string; ctx?: unknown; out?: unknown; vision?: unknown } =>
            typeof entry === 'object' &&
            entry !== null &&
            typeof (entry as { id?: unknown }).id === 'string'
        )
        .map((entry) => ({
          id: entry.id,
          label: shortModelId(entry.id),
          ctx: finiteNumber(entry.ctx),
          out: finiteNumber(entry.out),
          vision: entry.vision === true
        }))
    : []
  // Why: env.json is the command's truth. A cache written before a model switch must not
  // change the row into launching a different model than `deeprelay` will start.
  const models = cachedModels.some((entry) => entry.id === model)
    ? cachedModels
    : [
        { id: model, label: shortModelId(model), ctx: null, out: null, vision: false },
        ...cachedModels
      ]
  return {
    available: true,
    defaultId: model,
    models,
    base: typeof cfg?.base === 'string' ? cfg.base : null,
    fetchedAt: finiteNumber(cached?.at)
  }
}

export async function listDeeprelayModels(home = homedir()): Promise<DeeprelayModelList> {
  const paths = deeprelayPaths(home)
  const [config, cache] = await Promise.all([readJson(paths.envFile), readJson(paths.modelsCache)])
  return buildDeeprelayModelList(config, cache)
}

/** DeepRelay keeps Claude-format transcripts in its own profile, outside Orca's Claude roots. */
export function listDeeprelaySessions(root = deeprelayPaths().projects): Promise<AiVaultSession[]> {
  return listClaudeProfileSessions(root, (sessionId) => `deeprelay --resume ${sessionId}`)
}

export function registerDeeprelayHandlers(): void {
  ipcMain.handle('deeprelay:list', () => listDeeprelayModels())
  ipcMain.handle('deeprelay:sessions', () => listDeeprelaySessions())
}
