import type { SFTPWrapper } from 'ssh2'
import type { AgentHookInstallStatus } from '../../shared/agent-hook-types'
import { buildManagedCommandHook } from '../agent-hooks/installer-utils'
import {
  readHooksJsonRemote,
  writeHooksJsonRemote,
  writeManagedScriptRemote
} from '../agent-hooks/installer-utils-remote'
import type { ClaudeManagedHookPlan } from './claude-managed-hook-events'
import {
  applyManagedHooks,
  getPosixManagedScriptFileName,
  getRemoteConfigPath,
  getRemoteManagedCommand,
  type ClaudeCompatibleHookSettings
} from './hook-settings'

export type ClaudeRemoteHookInstall = {
  agent: AgentHookInstallStatus['agent']
  displayName: string
  settings: ClaudeCompatibleHookSettings
  /** Resolved inside the guarded install so a failure surfaces as a structured error. */
  plan: () => ClaudeManagedHookPlan
  posixScript: () => string
}

/** Installs the Claude hook on a remote box over SFTP; POSIX-only by design (Windows remotes deferred). */
export async function installClaudeHooksRemote(
  sftp: SFTPWrapper,
  remoteHome: string,
  install: ClaudeRemoteHookInstall
): Promise<AgentHookInstallStatus> {
  // Why: remote Windows is unsupported; local process.platform cannot identify the remote OS.
  const remoteConfigPath = getRemoteConfigPath(remoteHome, install.settings)
  const remoteScriptFileName = getPosixManagedScriptFileName(install.settings)
  const remoteScriptPath = `${remoteHome.replace(/\/$/, '')}/.orca/agent-hooks/${remoteScriptFileName}`
  const failed = (detail: string): AgentHookInstallStatus => ({
    agent: install.agent,
    state: 'error',
    configPath: remoteConfigPath,
    managedHooksPresent: false,
    detail
  })
  // Why: surface fallible SFTP installs as structured errors.
  try {
    const config = await readHooksJsonRemote(sftp, remoteConfigPath)
    if (!config) {
      return failed(`Could not parse remote ${install.displayName} settings.json`)
    }
    // Why: settings resolve HOME at runtime while SFTP still targets the discovered remote home.
    const hook = buildManagedCommandHook(getRemoteManagedCommand(remoteScriptPath))
    const nextConfig = applyManagedHooks(config, hook, remoteScriptFileName, install.plan())
    // Why: write scripts before settings to avoid settings pointing to missing scripts.
    // Why: SSH scripts always use POSIX .sh paths, regardless of the local OS.
    await writeManagedScriptRemote(sftp, remoteScriptPath, install.posixScript())
    // Why: no statusline install here — this path serves SSH remotes and WSL guests, whose relay hook
    // listener doesn't route /statusline/claude, and an SSH box's Claude login can be a different
    // account than the locally selected one, so its usage must not feed the local bar (live feed is host-local only).
    await writeHooksJsonRemote(sftp, remoteConfigPath, nextConfig)
    return {
      agent: install.agent,
      state: 'installed',
      configPath: remoteConfigPath,
      managedHooksPresent: true,
      detail: null
    }
  } catch (err) {
    return failed(err instanceof Error ? err.message : String(err))
  }
}
