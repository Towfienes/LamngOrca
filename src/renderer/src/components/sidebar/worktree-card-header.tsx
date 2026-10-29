import React from 'react'
import { AlertCircle, Moon, Server, ServerOff, Star, Trash2, GitBranch, Folder } from 'lucide-react'

import { RepoIconGlyph } from '@/components/repo/repo-icon'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { Repo } from '../../../../shared/repo-types'
import { resolveRepoHeaderColor } from './project-header-color'
import { runSleepWorktree } from './sleep-worktree-flow'
import { formatSparseDirectoryPreview, shouldBeginWorktreeRename } from './worktree-card-model'
import type { WorktreeCardPresentation } from './worktree-card-presentation'
import { WorktreeCardSshHostControl } from './WorktreeCardSshHostControl'
import { useIsSleepingWorktree } from './use-worktree-sleep-state'
import { WorktreeTitleInlineRename } from './WorktreeTitleInlineRename'
import type { WorktreeCardController } from './use-worktree-card-controller'

function RepoIdentityChip({
  repo,
  children
}: {
  repo: Repo
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className="inline-flex h-4 max-w-24 shrink-0 items-center justify-center gap-0.5 rounded-[4px] border border-worktree-sidebar-border bg-worktree-sidebar-accent/55 px-0.5"
          aria-label={translate(
            'auto.components.sidebar.WorktreeCard.35ccfe2475',
            'Project {{value0}}',
            { value0: repo.displayName }
          )}
        >
          {/* Why: emoji glyphs scale with font size (0.9em), so pin it to fit the 12px icon box. */}
          <span className="inline-flex size-3 shrink-0 items-center justify-center text-2xs">
            {children}
          </span>
          {/* Why: the default folder icon is the same for every project, so the name tells them apart. */}
          <span className="min-w-0 truncate text-3xs leading-none text-muted-foreground lowercase">
            {repo.displayName}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {repo.displayName}
      </TooltipContent>
    </Tooltip>
  )
}

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

  return (
    <div className="deck-tree-header flex min-w-0 items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="deck-branch-glyph text-muted-foreground" aria-hidden="true">
          {isFolder ? <Folder className="size-3" /> : <GitBranch className="size-3" />}
        </span>
        {showPinnedRepoIcon && (
          <RepoIdentityChip repo={repo!}>
            <RepoIconGlyph
              repoIcon={repo!.repoIcon}
              color={resolveRepoHeaderColor(repo!.badgeColor)}
              className="size-full"
              iconClassName="size-3"
            />
          </RepoIdentityChip>
        )}

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
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="shrink-0 inline-flex items-center">
                {isRuntimeDisconnected ? (
                  // This surface shows runtime disconnection passively; reconnect controls belong to host management.
                  <ServerOff className="size-3 text-destructive" />
                ) : (
                  <Server className="size-3 text-muted-foreground" />
                )}
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {isRuntimeDisconnected
                ? runtimeHostLabel
                  ? translate(
                      'auto.components.sidebar.WorktreeCard.runtimeHostDisconnectedNamed',
                      '{{hostName}} disconnected',
                      { hostName: runtimeHostLabel }
                    )
                  : translate(
                      'auto.components.sidebar.WorktreeCard.runtimeHostDisconnected',
                      'Server disconnected'
                    )
                : runtimeHostLabel
                  ? translate(
                      'auto.components.sidebar.WorktreeCard.runtimeHostProjectNamed',
                      'Project on {{hostName}}',
                      { hostName: runtimeHostLabel }
                    )
                  : translate(
                      'auto.components.sidebar.WorktreeCard.runtimeHostProject',
                      'Project on Orca server'
                    )}
            </TooltipContent>
          </Tooltip>
        )}

        {showInlineRepoBadge && (
          <RepoIdentityChip repo={repo!}>
            <RepoIconGlyph
              repoIcon={repo!.repoIcon}
              color={resolveRepoHeaderColor(repo!.badgeColor)}
              className="size-full"
              iconClassName="size-3"
            />
          </RepoIdentityChip>
        )}

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
          // Errors can contain raw agent output; open a dialog rather than a tooltip.
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                onPointerDown={stopQuickActionPointerPropagation}
                onClick={handleOpenRenameErrorDialog}
                onDoubleClick={handleOpenRenameErrorDialog}
                className="h-4 shrink-0 gap-0.5 rounded !px-0.5 text-[10px] font-medium leading-none text-destructive border border-destructive/40 bg-destructive/10 hover:bg-destructive/15 hover:text-destructive has-[>svg]:!px-0.5"
                aria-label={translate(
                  'auto.components.sidebar.WorktreeCard.02e19349f4',
                  'Auto-rename failed: view error'
                )}
              >
                <AlertCircle className="size-2.5" />
                {translate('auto.components.sidebar.WorktreeCard.74522ee457', 'rename failed')}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {translate(
                'auto.components.sidebar.WorktreeCard.4eba2ea99e',
                'Auto-name failed. Click to see details.'
              )}
            </TooltipContent>
          </Tooltip>
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
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge
                variant="outline"
                className="h-[16px] px-1.5 text-[10px] font-medium rounded shrink-0 leading-none text-amber-700 dark:text-amber-300 border-amber-500/30 bg-amber-500/5"
              >
                {translate('auto.components.sidebar.WorktreeCard.4f964d5e8c', 'sparse')}
              </Badge>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="max-w-72">
              <div className="space-y-1">
                <div>
                  {translate(
                    'auto.components.sidebar.WorktreeCard.0f33af979b',
                    'Partial checkout. Files outside these paths are not on disk.'
                  )}
                </div>
                {worktree.sparseDirectories && worktree.sparseDirectories.length > 0 ? (
                  <div className="font-mono text-[11px] opacity-80">
                    {formatSparseDirectoryPreview(worktree.sparseDirectories)}
                  </div>
                ) : null}
              </div>
            </TooltipContent>
          </Tooltip>
        )}

        {showTitleRowIndicators && titleRowIndicators}
      </div>

      {showHeaderActions && (
        <div className="ml-auto flex shrink-0 items-center justify-center gap-1 pr-1.5">
          {showTitleRowPrimary && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="shrink-0 inline-flex items-center"
                  aria-label={translate(
                    'auto.components.sidebar.WorktreeCard.0d224eff10',
                    'Primary worktree'
                  )}
                >
                  <Star className="size-3 fill-amber-400 text-amber-400" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {translate(
                  'auto.components.sidebar.WorktreeCard.0777de5970',
                  'Primary worktree (original clone directory)'
                )}
              </TooltipContent>
            </Tooltip>
          )}

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
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  data-workspace-board-preserve-open=""
                  onPointerDown={stopQuickActionPointerPropagation}
                  onClick={handleWorkspaceQuickAction}
                  className={cn(
                    'inline-flex size-4 items-center justify-center rounded bg-transparent opacity-0 transition-colors transition-opacity',
                    'group-hover/worktree-card:opacity-100 group-focus-within/worktree-card:opacity-100 focus-visible:opacity-100',
                    'text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:bg-destructive/10 focus-visible:text-destructive'
                  )}
                  aria-label={translate(
                    'auto.components.sidebar.WorktreeCard.6f09f58541',
                    'Delete workspace'
                  )}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {translate('auto.components.sidebar.WorktreeCard.6f09f58541', 'Delete workspace')}
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  )
}
