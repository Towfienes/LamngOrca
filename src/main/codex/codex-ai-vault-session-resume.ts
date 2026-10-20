import type { GlobalSettings } from '../../shared/global-settings-types'
import { prepareAccountSessionResume } from '../ai-vault/account-session-resume'
import type {
  AiVaultPrepareSessionResumeArgs,
  AiVaultPrepareSessionResumeResult
} from '../../shared/ai-vault-resume-preparation'
import type { CodexRuntimeHomeService } from '../codex-accounts/runtime-home-service'
import { prepareLegacySharedCodexSessionResume } from './codex-legacy-session-resume'

type CodexAiVaultRuntimeHome = Pick<
  CodexRuntimeHomeService,
  'isHostSystemDefaultRealHome' | 'resolveSelectedHostAccountCodexHomePathForResume'
>

/** Keeps window and serve AI Vault resumes behind the same refusing account-home gate. */
export function prepareCodexAiVaultSessionResume(
  args: AiVaultPrepareSessionResumeArgs,
  options: {
    settings?: GlobalSettings
    runtimeHome: CodexAiVaultRuntimeHome | null
    systemCodexHomePath: string | undefined
  }
): Promise<AiVaultPrepareSessionResumeResult> {
  if (args.accountId) {
    if (!options.settings)
      {return Promise.reject(new Error('Launch account settings are unavailable.'))}
    return prepareAccountSessionResume(args, options.settings)
  }
  return prepareLegacySharedCodexSessionResume(args, {
    isHostSystemDefaultRealHome: () => options.runtimeHome?.isHostSystemDefaultRealHome() === true,
    getSelectedHostAccountCodexHomePath: () =>
      options.runtimeHome?.resolveSelectedHostAccountCodexHomePathForResume() ?? null,
    systemCodexHomePath: options.systemCodexHomePath
  })
}
