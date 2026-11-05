import React from 'react'
import { Moon, GitBranch, Folder } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import { runSleepWorktree } from '../../workspace-actions/sleep/sleep-worktree-flow'
import { shouldBeginWorktreeRename } from '../controller/worktree-card-model'
import type { WorktreeCardPresentation } from './worktree-card-presentation'
import {
  WorktreeCardDeleteQuickAction,
  WorktreeCardPrimaryStar,
  WorktreeCardRenameErrorButton,
  WorktreeCardRepoChip,
  WorktreeCardRuntimeHostMark,
  WorktreeCardSparseBadge
} from '../identity/worktree-card-header-items'
import { WorktreeCardSshHostControl } from '../host/WorktreeCardSshHostControl'
import { useIsSleepingWorktree } from '../../workspace-actions/sleep/use-worktree-sleep-state'
import { WorktreeTitleInlineRename } from '../identity/WorktreeTitleInlineRename'
import type { WorktreeCardController } from '../controller/use-worktree-card-controller'

export function WorktreeCardHeader({
  card,
  presentation
}: {
  card: WorktreeCardController
  presentation: WorktreeCardPresentation
}): React.JSX.Element {
  const {
    worktree,
    repo,
    affiliateListMode,
    isActiveSurface,
    renameRowKey,
    compactCards,
    newCardStyle,
    parsedRepoHost,
    sshTargetLabel,
    sshStatus,
    sshTargetRemoved,
    sshOwnerEnvironmentId,
    stopQuickActionPointerPropagation,
    isRuntimeDisconnected,
    runtimeHostLabel,
    visibleCardTitle,
    isDeleting,
    showUnreadEmphasis,
    setTitleRenaming,
    handleRenameTitle,
    renamingWorktreeId,
    setRenamingWorktreeId,
    titleRenaming,
    handleOpenRenameErrorDialog,
    isFolder,
    handleWorkspaceQuickAction
  } = card
  const {
    showPinnedRepoIcon,
    showInlineRepoBadge,
    showHeaderActions,
    showTitleRowPrimary,
    showDeleteQuickAction,
    showSleepQuickAction,
    showTitleRowIndicators,
    titleRowIndicators,
    titleWrapper
  } = presentation
  // Why: a workspace with no live pane has nothing to release, so the moon would be a dead click.
  const isSleeping = useIsSleepingWorktree(worktree.id)
  const canSleepQuickAction = showSleepQuickAction && !isSleeping && !isDeleting
  const hasHoverDetails = presentation.hasHoverDetails && !titleRenaming

  return (
    <div className="deck-tree-header flex min-w-0 items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="deck-branch-glyph text-muted-foreground" aria-hidden="true">
          {isFolder ? <Folder className="size-3" /> : <GitBranch className="size-3" />}
        </span>
        {showPinnedRepoIcon && <WorktreeCardRepoChip repo={repo!} />}

        {repo?.connectionId && (
          <WorktreeCardSshHostControl
            targetId={repo.connectionId}
            targetLabel={sshTargetLabel || repo.displayName}
            status={sshStatus}
            targetRemoved={sshTargetRemoved}
            sshOwnerEnvironmentId={sshOwnerEnvironmentId}
            iconOnly={compactCards || newCardStyle}
            onPointerDown={stopQuickActionPointerPropagation}
          />
        )}

        {!repo?.connectionId && parsedRepoHost?.kind === 'runtime' && (
          <WorktreeCardRuntimeHostMark
            disconnected={isRuntimeDisconnected}
            hostLabel={runtimeHostLabel}
          />
        )}

        {showInlineRepoBadge && <WorktreeCardRepoChip repo={repo!} />}

        <WorktreeTitleInlineRename
          displayName={visibleCardTitle}
          disabled={isDeleting || affiliateListMode}
          showUnreadEmphasis={showUnreadEmphasis}
          dimReadTitle={newCardStyle}
          className="text-[13px] leading-5"
          editingClassName="flex-1"
          titleWrapper={titleWrapper}
          onEditingChange={affiliateListMode ? undefined : setTitleRenaming}
          onRename={handleRenameTitle}
          beginEditing={
            !affiliateListMode &&
            shouldBeginWorktreeRename(renamingWorktreeId, worktree.id, renameRowKey)
          }
          onBeginEditingConsumed={affiliateListMode ? undefined : () => setRenamingWorktreeId(null)}
        />

        {typeof worktree.firstAgentMessageRenameError === 'string' &&
        worktree.firstAgentMessageRenameError.length > 0 &&
        !titleRenaming ? (
          <WorktreeCardRenameErrorButton
            onPointerDown={stopQuickActionPointerPropagation}
            onOpen={handleOpenRenameErrorDialog}
          />
        ) : null}
        {!compactCards && worktree.isMainWorktree && !isFolder && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                data-deck-primary-worktree=""
                variant="outline"
                className="h-[16px] px-1.5 text-[10px] font-medium rounded shrink-0 leading-none text-foreground/70 border-foreground/20 bg-foreground/[0.06]"
              >
                {translate('auto.components.sidebar.WorktreeCard.7d517f82e2', 'primary')}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {translate(
                'auto.components.sidebar.WorktreeCard.0777de5970',
                'Primary worktree (original clone directory)'
              )}
            </TooltipContent>
          </Tooltip>
        )}

        {worktree.isSparse && (
          <WorktreeCardSparseBadge
            card={card}
            hasHoverDetails={hasHoverDetails}
            directories={worktree.sparseDirectories}
          />
        )}

        {showTitleRowIndicators && titleRowIndicators}
      </div>

      {showHeaderActions && (
        <div className="ml-auto flex shrink-0 items-center justify-center gap-1 pr-1.5">
          {showTitleRowPrimary && <WorktreeCardPrimaryStar />}

          {canSleepQuickAction && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-workspace-board-preserve-open=""
                  data-worktree-sleep-quick-action=""
                  onPointerDown={stopQuickActionPointerPropagation}
                  onClick={(event) => {
                    // Why: the card's own click activates the workspace; sleeping must not also
                    // select it, or the sleep intent gets cleared by the activation it caused.
                    event.stopPropagation()
                    void runSleepWorktree(worktree.id)
                  }}
                  onDoubleClick={(event) => event.stopPropagation()}
                  className={cn(
                    'inline-flex size-4 items-center justify-center rounded bg-transparent opacity-0 transition-colors transition-opacity',
                    // Why: the selected workspace keeps its moon on screen — the affordance the user
                    // reaches for most often should not need a hover first.
                    isActiveSurface && 'opacity-100',
                    'group-hover/worktree-card:opacity-100 group-focus-within/worktree-card:opacity-100 focus-visible:opacity-100',
                    'text-muted-foreground hover:bg-worktree-sidebar-accent hover:text-worktree-sidebar-accent-foreground focus-visible:bg-worktree-sidebar-accent focus-visible:text-worktree-sidebar-accent-foreground'
                  )}
                  aria-label={translate(
                    'auto.components.sidebar.WorktreeCard.sleepWorkspace',
                    'Sleep workspace'
                  )}
                >
                  <Moon className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8} className="max-w-[220px]">
                {translate(
                  'auto.components.sidebar.WorktreeContextMenu.0918b35e4f',
                  'Close all active panels in this workspace to free up memory and CPU.'
                )}
              </TooltipContent>
            </Tooltip>
          )}

          {showDeleteQuickAction && (
            <WorktreeCardDeleteQuickAction
              onPointerDown={stopQuickActionPointerPropagation}
              onClick={handleWorkspaceQuickAction}
            />
          )}
        </div>
      )}
    </div>
  )
}
