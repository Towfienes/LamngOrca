import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, mkdir, realpath } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import type { GlobalSettings } from '../../shared/global-settings-types'
import type {
  AiVaultPrepareSessionResumeArgs,
  AiVaultPrepareSessionResumeResult
} from '../../shared/ai-vault-resume-preparation'
import { LOCAL_EXECUTION_HOST_ID } from '../../shared/execution-host'
import { resolveOwnedClaudeManagedAuthPath } from '../claude-accounts/managed-auth-path'
import { resolvePinnedCodexLaunchHome } from '../ipc/pty/host-env/codex-launch-account'
import { AGENT_LAUNCH_ACCOUNT_ENV } from '../../shared/agent-launch-account'
import { getSystemCodexHomePath } from '../codex/codex-home-paths'
import { configuredAdditionalCodexHomePaths } from './cached-session-list'
import { managedClaudeSessionRoots } from './managed-claude-session-roots'
import { copySessionFileWithoutOverwrite } from '../codex/codex-session-backfill-copy'
import { reconcileAccountSession } from './account-session-reconciliation'

export async function prepareAccountSessionResume(
  args: AiVaultPrepareSessionResumeArgs,
  settings: GlobalSettings
): Promise<AiVaultPrepareSessionResumeResult> {
  if (args.executionHostId !== LOCAL_EXECUTION_HOST_ID || !args.accountId) {
    throw new Error('This account is only available on its local host.')
  }
  let targetRoot: string
  let sourceRoots: string[]
  if (args.agent === 'codex') {
    const home = resolvePinnedCodexLaunchHome(
      { launchAgent: 'codex', env: { [AGENT_LAUNCH_ACCOUNT_ENV]: args.accountId } },
      { runtime: 'host' },
      settings
    )
    if (!home) {
      throw new Error('The chosen Codex account is unavailable.')
    }
    targetRoot = join(home, 'sessions')
    sourceRoots = [getSystemCodexHomePath(), ...configuredAdditionalCodexHomePaths()].map((h) =>
      join(h, 'sessions')
    )
  } else if (args.agent === 'claude') {
    const account = settings.claudeManagedAccounts.find(
      (a) => a.id === args.accountId && a.managedAuthRuntime !== 'wsl'
    )
    const home = account && resolveOwnedClaudeManagedAuthPath(account.id, account.managedAuthPath)
    if (!home) {
      throw new Error('The chosen Claude account is unavailable.')
    }
    targetRoot = join(home, 'projects')
    sourceRoots = [join(homedir(), '.claude', 'projects'), ...managedClaudeSessionRoots(settings)]
  } else {
    throw new Error('This agent does not use Orca-managed launch accounts.')
  }
  const source = await realpath(args.filePath)
  const stat = await lstat(args.filePath)
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('The session transcript is not a regular file.')
  }
  let sessionRelative: string | null = null
  for (const root of sourceRoots) {
    const lexical = relative(resolve(root), resolve(args.filePath))
    if (!inside(lexical)) {
      continue
    }
    const canonical = relative(await realpath(root), source)
    if (inside(canonical)) {
      sessionRelative = canonical
      break
    }
  }
  if (!sessionRelative || !sessionRelative.endsWith('.jsonl')) {
    throw new Error('This transcript is outside the agent session history.')
  }
  const segments = sessionRelative.split(sep)
  if (
    args.agent === 'codex'
      ? segments.length !== 4 || !segments.slice(0, 3).every((p) => /^\d+$/.test(p))
      : segments.length !== 2
  ) {
    throw new Error('This transcript has an unsupported session layout.')
  }
  await mkdir(targetRoot, { recursive: true })
  const canonicalTargetRoot = await realpath(targetRoot)
  if (canonicalTargetRoot !== resolve(targetRoot)) {
    throw new Error('The account session directory is redirected.')
  }
  const target = join(targetRoot, sessionRelative)
  let parent = targetRoot
  for (const segment of segments.slice(0, -1)) {
    parent = join(parent, segment)
    try {
      await mkdir(parent)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
        throw error
      }
    }
    const parentStat = await lstat(parent)
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) {
      throw new Error('The account session directory is redirected.')
    }
  }
  if (resolve(target) !== source) {
    try {
      await copySessionFileWithoutOverwrite(source, target)
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) {
        throw error
      }
      const existing = await lstat(target)
      let ready = false
      if (existing.isFile() && !existing.isSymbolicLink()) {
        ready = (await digest(source)) === (await digest(target))
        if (!ready) {
          ready = await reconcileAccountSession(
            source,
            target,
            join(dirname(targetRoot), '.orca-session-resume-backups'),
            args.sessionId,
            args.agent
          )
        }
      }
      if (!ready) {
        throw new Error(
          'A different transcript already exists in the chosen account. No history was overwritten.'
        )
      }
    }
  }
  return {
    useRealCodexHome: false,
    ...(args.agent === 'codex' ? { substituteCodexHome: dirname(targetRoot) } : {})
  }
}

function inside(value: string): boolean {
  return value === '' || (!isAbsolute(value) && value !== '..' && !value.startsWith(`..${sep}`))
}
async function digest(file: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(file)) {
    hash.update(chunk)
  }
  return hash.digest('hex')
}
