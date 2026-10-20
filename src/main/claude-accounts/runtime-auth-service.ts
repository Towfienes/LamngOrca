import type { Store } from '../persistence'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { claudeHookService } from '../claude/hook-service'
import { isAgentStatusHooksEnabledForAgent } from '../../shared/agent-status-hooks-setting'
import { writeActiveClaudeKeychainCredentials } from './keychain'
import {
  getSelectedClaudeAccountIdForTarget,
  type ClaudeAccountSelectionTarget
} from './runtime-selection'
import { ClaudeRuntimeAuthSync } from './runtime-auth/runtime-auth-sync'
import type { ClaudeRuntimeAuthPreparation } from './runtime-auth/runtime-auth-types'

export type { ClaudeRuntimeAuthPreparation } from './runtime-auth/runtime-auth-types'

export class ClaudeRuntimeAuthService extends ClaudeRuntimeAuthSync {
  constructor(store: Store) {
    super(store)
    this.initializeLastSyncedState()
    void this.safeSyncForCurrentSelection()
  }

  async prepareForClaudeLaunch(
    target?: ClaudeAccountSelectionTarget,
    accountId?: string
  ): Promise<ClaudeRuntimeAuthPreparation> {
    const effectiveTarget = target ?? this.getDefaultAccountSelectionTarget()
    if (accountId !== undefined) {
      return this.serializeMutation(async () => {
        const account = this.store
          .getSettings()
          .claudeManagedAccounts.find((a) => a.id === accountId)
        if (!account || account.managedAuthRuntime === 'wsl' || effectiveTarget.runtime === 'wsl') {
          throw new Error('This Claude account is not available on this host.')
        }
        const configDir = await this.getOwnedManagedAuthPath(account)
        const credentials = await this.readManagedCredentials(account)
        if (!configDir || !credentials) {
          throw new Error('Sign in again to use this Claude account.')
        }
        const configPath = join(configDir, '.claude.json')
        if (!existsSync(configPath)) {
          const config = this.readJsonObject(this.pathResolver.getRuntimePaths().configPath)
          const oauthAccount = await this.readManagedOauthAccount(account)
          if (!config || !oauthAccount) {
            throw new Error('Sign in again to prepare this Claude account.')
          }
          this.writeJson(configPath, { ...config, oauthAccount })
        }
        if (process.platform === 'darwin') {
          await writeActiveClaudeKeychainCredentials(credentials, configDir)
        }
        if (isAgentStatusHooksEnabledForAgent(this.store.getSettings(), 'claude')) {
          claudeHookService.syncManagedHooksToConfigDir(configDir)
        }
        return {
          configDir,
          runtime: 'host',
          envPatch: { CLAUDE_CONFIG_DIR: configDir },
          stripAuthEnv: true,
          provenance: `managed:${account.id}`
        }
      })
    }
    await this.syncForCurrentSelection(effectiveTarget)
    return this.getPreparation(effectiveTarget)
  }

  async prepareForRateLimitFetch(
    target?: ClaudeAccountSelectionTarget
  ): Promise<ClaudeRuntimeAuthPreparation> {
    const effectiveTarget = target ?? this.getDefaultAccountSelectionTarget()
    await this.syncForCurrentSelection(effectiveTarget)
    return this.getPreparation(effectiveTarget)
  }

  async syncForCurrentSelection(target?: ClaudeAccountSelectionTarget): Promise<void> {
    await this.serializeMutation(() =>
      this.doSyncForCurrentSelection(target ?? this.getDefaultAccountSelectionTarget())
    )
  }

  async forceMaterializeCurrentSelectionForRollback(): Promise<void> {
    await this.serializeMutation(async () => {
      const settings = this.store.getSettings()
      if (!settings.activeClaudeManagedAccountId) {
        const previousAccount = this.getActiveAccount(
          settings.claudeManagedAccounts,
          this.lastSyncedAccountId
        )
        await this.restoreSystemDefaultSnapshot(
          previousAccount ? await this.readManagedCredentials(previousAccount) : null,
          previousAccount ? await this.readManagedOauthAccount(previousAccount) : undefined
        )
        this.lastSyncedAccountId = null
        return
      }
      await this.doSyncForCurrentSelection()
    })
  }

  getRuntimeConfigDir(target?: ClaudeAccountSelectionTarget): string {
    return this.getPreparation(target).configDir
  }

  private initializeLastSyncedState(): void {
    const settings = this.store.getSettings()
    this.lastSyncedAccountId = getSelectedClaudeAccountIdForTarget(settings, { runtime: 'host' })
  }

  private async safeSyncForCurrentSelection(): Promise<void> {
    try {
      await this.syncForCurrentSelection()
    } catch (error) {
      console.warn('[claude-runtime-auth] Failed to sync runtime auth state:', error)
    }
  }

  private serializeMutation<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.mutationQueue.then(fn, fn)
    this.mutationQueue = next.catch(() => {})
    return next
  }

  // Why: re-auth/add-account write fresh managed tokens; skip the next read-back so stale runtime tokens can't overwrite them.
  clearLastWrittenCredentialsJson(
    accountId = this.store.getSettings().activeClaudeManagedAccountId
  ): void {
    if (accountId === this.store.getSettings().activeClaudeManagedAccountId) {
      this.lastWrittenCredentialsJson = null
    }
    this.skipNextReadBackForAccountId = accountId
  }
}
