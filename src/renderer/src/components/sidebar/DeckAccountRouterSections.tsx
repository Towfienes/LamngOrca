import { DeckClaude9Section } from './DeckClaude9Section'
import { DeckDeeprelaySection } from './DeckDeeprelaySection'
import type { Claude9ModelList } from '../../../../shared/claude9-models'
import type { DeeprelayModelList } from '../../../../shared/deeprelay-models'

export type DeckAccountRouterPreview = 'claude9' | 'deeprelay' | null

/** The alternate launch sources under the Claude accounts: 9router and DeepRelay. */
export function DeckAccountRouterSections({
  claude9,
  deeprelay,
  altPreview,
  disabled,
  onPreview,
  onLaunchClaude9,
  onLaunchDeeprelay,
  onRetryClaude9,
  onRetryDeeprelay
}: {
  claude9: Claude9ModelList | null
  deeprelay: DeeprelayModelList | null
  altPreview: DeckAccountRouterPreview
  disabled: boolean
  onPreview: (target: 'claude9' | 'deeprelay') => void
  onLaunchClaude9?: () => void
  onLaunchDeeprelay?: () => void
  onRetryClaude9: () => void
  onRetryDeeprelay: () => void
}): React.JSX.Element {
  return (
    <div className="space-y-1 border-t border-border pt-2">
      {onLaunchClaude9 ? (
        <DeckClaude9Section
          list={claude9}
          selected={altPreview === 'claude9'}
          disabled={disabled}
          onPreview={() => onPreview('claude9')}
          onRetry={onRetryClaude9}
          onLaunch={onLaunchClaude9}
        />
      ) : null}
      {onLaunchDeeprelay ? (
        <DeckDeeprelaySection
          list={deeprelay}
          selected={altPreview === 'deeprelay'}
          disabled={disabled}
          onPreview={() => onPreview('deeprelay')}
          onRetry={onRetryDeeprelay}
          onLaunch={onLaunchDeeprelay}
        />
      ) : null}
    </div>
  )
}
