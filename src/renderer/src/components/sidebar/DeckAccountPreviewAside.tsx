import { DeckAccountUsage } from './DeckAccountUsage'
import { DeckClaude9Detail } from './DeckClaude9Section'
import { DeckDeeprelayDetail } from './DeckDeeprelaySection'
import type { DeckAccountRouterPreview } from './DeckAccountRouterSections'
import type { Claude9ModelList } from '../../../../shared/claude9-models'
import type { DeeprelayModelList } from '../../../../shared/deeprelay-models'
import type { ProviderRateLimits } from '../../../../shared/rate-limit-types'

/** The right-hand preview: the hovered account's quota, or a router launcher's details. */
export function DeckAccountPreviewAside({
  altPreview,
  claude9,
  deeprelay,
  previewLabel,
  selectedUsage
}: {
  altPreview: DeckAccountRouterPreview
  claude9: Claude9ModelList | null
  deeprelay: DeeprelayModelList | null
  previewLabel: string
  selectedUsage: ProviderRateLimits | null
}): React.JSX.Element {
  return (
    <aside
      className="w-64 min-w-0 space-y-3 border-l border-border p-3"
      aria-label="Account usage preview"
      aria-live="polite"
    >
      {altPreview === 'claude9' ? (
        <DeckClaude9Detail list={claude9} />
      ) : altPreview === 'deeprelay' ? (
        <DeckDeeprelayDetail list={deeprelay} />
      ) : (
        <>
          <p className="text-xs font-medium">Usage</p>
          <p className="truncate text-xs text-muted-foreground" title={previewLabel}>
            {previewLabel}
          </p>
          <DeckAccountUsage usage={selectedUsage} />
        </>
      )}
    </aside>
  )
}
