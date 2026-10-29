import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { resolveAbsoluteDirOverride } from '../../shared/absolute-dir-override'
import { normalizedWslHomeDirs, sessionRootDirs } from './session-scanner-roots'

// Layout (dsh-tui's own persistence backend): one directory per workspace under
// the sessions root, one directory per session under it, and the committed log
// inside as `session.vN.jsonl[.zstd]`.
const SESSION_LOG_BASENAME = /^session(?:\.v[1-9][0-9]*)?\.jsonl(?:\.zstd)?$/

/** `$DSH_HOME ?? ~/.dsh`, matching the launcher's own resolution. */
export function dshHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  return resolveAbsoluteDirOverride(env.DSH_HOME, join(homedir(), '.dsh'))
}

/**
 * Session roots in dsh-tui's own priority order: an explicit
 * `DSH_TUI_SESSION_ROOT`, then `<DSH_HOME>/sessions`, then the legacy
 * `~/.dsh-tui/sessions` of the same install.
 *
 * Why the legacy root is skipped when a test injects a root: it is a real
 * directory on a developer machine, and an injected scan must not inherit it.
 */
export function dshSessionRootDirs(args: {
  dshSessionsDir?: string
  wslHomeDirs?: readonly string[]
  env?: NodeJS.ProcessEnv
}): string[] {
  const env = args.env ?? process.env
  const override = env.DSH_TUI_SESSION_ROOT?.trim()
  const hostRoot = args.dshSessionsDir ?? (override || join(dshHomeDir(env), 'sessions'))
  const wslHomeDirs = normalizedWslHomeDirs(args.wslHomeDirs)
  const roots = sessionRootDirs(hostRoot, wslHomeDirs, ['.dsh', 'sessions'])
  if (args.dshSessionsDir) {
    return roots
  }
  return [
    ...roots,
    join(homedir(), '.dsh-tui', 'sessions'),
    ...wslHomeDirs.map((homeDir) => join(homeDir, '.dsh-tui', 'sessions'))
  ]
}

/** Whether a file is one committed session generation the scanner may read. */
export function isDshSessionLogFile(filePath: string): boolean {
  return SESSION_LOG_BASENAME.test(basename(filePath))
}

/** The session id is the directory the log lives in; `--resume` takes this value. */
export function dshSessionIdFromLogPath(filePath: string): string {
  return basename(dirname(filePath))
}

/**
 * dsh-tui's session-list projection for this session, or null when the root has
 * no such cache (the legacy root never wrote one).
 *
 * Why this exists beside the log: the log is zstd-compressed, and an execution
 * host that can only hand back text (SSH) cannot decode it; the projection is
 * plain JSON and carries cwd/title/timestamps, so remote history still lists.
 */
export function dshProjcachePathForSessionLog(filePath: string): string | null {
  const sessionRoot = dirname(dirname(filePath))
  const dshHome = dirname(sessionRoot)
  if (basename(sessionRoot) !== 'sessions' || basename(dshHome) === '.dsh-tui') {
    return null
  }
  return join(
    dshHome,
    'storages',
    'session_projcache',
    'sessions',
    `${dshSessionIdFromLogPath(filePath)}.json`
  )
}
