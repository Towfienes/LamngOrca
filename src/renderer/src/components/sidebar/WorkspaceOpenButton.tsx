import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { isLocalPathOpenBlocked } from '@/lib/local-path-open-guard'
import { getLocalFileManagerLabel } from '@/lib/local-file-manager-label'
import { useShallow } from 'zustand/react/shallow'
import { toast } from 'sonner'
import { useAppStore } from '@/store'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { OpenInApplicationIcon } from '@/lib/open-in-app-catalog'
import { getExternalEditorOpenCapability } from '@/lib/external-editor-open-capability'
import { selectWorkspaceChromeTarget } from '@/lib/workspace-chrome-target'
import { translate } from '@/i18n/i18n'
import { openWorktreePath } from './WorktreeOpenInMenu'

export function WorkspaceOpenButton({
  application
}: {
  application: 'vscode' | 'file-manager'
}): React.JSX.Element {
  const target = useAppStore(useShallow(selectWorkspaceChromeTarget))
  const settings = useAppStore((state) => state.settings)
  const [opening, setOpening] = useState(false)
  const allowed =
    target &&
    target.connectionId !== undefined &&
    !target.runtimeEnvironmentId &&
    (application === 'file-manager'
      ? !isLocalPathOpenBlocked(settings, target)
      : getExternalEditorOpenCapability(settings, {
          connectionId: target.connectionId,
          command: 'code'
        }).allowed)
  const label =
    application === 'vscode'
      ? translate('deck.workspace.openVSCode', 'Open workspace in VS Code')
      : translate('deck.workspace.openFolder', 'Open workspace in {{application}}', {
          application: getLocalFileManagerLabel()
        })
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          disabled={!allowed || opening}
          onClick={async () => {
            if (!target || !allowed || opening) {
              return
            }
            setOpening(true)
            try {
              await openWorktreePath({
                target: application === 'file-manager' ? 'file-manager' : 'external-editor',
                worktreePath: target.path,
                connectionId: target.connectionId,
                command: 'code'
              })
            } catch {
              toast.error(
                translate(
                  'auto.components.sidebar.WorktreeOpenInMenu.9a5381eb09',
                  'Could not open workspace folder.'
                )
              )
            } finally {
              setOpening(false)
            }
          }}
        >
          {application === 'vscode' ? (
            <OpenInApplicationIcon application={{ command: 'code' }} />
          ) : (
            <FolderOpen />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {application === 'file-manager' && target && !allowed
          ? translate(
              'deck.workspace.remoteFolderUnavailable',
              'Opening remote folders in the local file manager is unavailable.'
            )
          : label}
        {target ? (
          <span className="block max-w-64 truncate text-muted-foreground">{target.path}</span>
        ) : null}
      </TooltipContent>
    </Tooltip>
  )
}
