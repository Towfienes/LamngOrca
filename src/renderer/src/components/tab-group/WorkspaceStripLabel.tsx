import { useShallow } from 'zustand/react/shallow'
import { Folder } from 'lucide-react'
import { useAppStore } from '@/store'
import { selectWorkspaceChromeTarget } from '@/lib/workspace-chrome-target'

export function WorkspaceStripLabel({
  workspaceId
}: {
  workspaceId: string
}): React.JSX.Element | null {
  const target = useAppStore(useShallow((state) => selectWorkspaceChromeTarget(state, workspaceId)))
  return target ? (
    <div className="deck-workspace-strip-label">
      <div className="deck-workspace-strip-caption" title={target.path}>
        <Folder className="size-3 shrink-0" aria-hidden />
        <span className="truncate">{target.name}</span>
      </div>
    </div>
  ) : null
}
