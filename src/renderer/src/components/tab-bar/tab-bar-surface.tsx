import React from 'react'
import { useAppStore } from '@/store'
import { useWorkspaceLaunchSelection } from '@/store/workspace-launch-selection'
import { SortableContext } from '@dnd-kit/sortable'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ProjectedAgentMenuItems } from './QuickLaunchButton'
import { WorkspaceStripLabel } from '../tab-group/WorkspaceStripLabel'
import { WorkspaceTabDots } from '../tab-group/WorkspaceTabDots'
import TabBarCreateEntry from './TabBarCreateEntry'
import { TabStripScrollIndicator } from './TabStripScrollIndicator'
import { TabStripTooltipProvider } from './TabStripTooltipProvider'
import { getTabStripScrollMaskClassName } from './tab-strip-scroll-metrics'
import type { useTabStripOverflowNavigation } from './tab-strip-overflow-navigation'
import type { useTabStripDragScrollHandlers } from './tab-strip-drag-scroll'
import type { TabBarProps } from './tab-bar-props'
import type { TabBarRuntimeModel } from './use-tab-bar-runtime-model'
import type { TabBarCreateMenuController } from './use-tab-bar-create-menu-controller'
import type { TabBarItemProjection } from './use-tab-bar-item-projection'
import type { TabBarItemActions } from './use-tab-bar-item-actions'
import { renderTabBarItems } from './tab-bar-item-surface'
import { TabBarStaticCreateMenu } from './tab-bar-static-create-menu'
import ClientHostedBrowserTabRows from './ClientHostedBrowserTabRows'
import type { ClientHostedBrowserRow } from '../../../../shared/client-hosted-browser-rows'

const EMPTY_CLIENT_HOSTED_ROWS: readonly ClientHostedBrowserRow[] = []

export function renderTabBarSurface({
  props,
  runtime,
  createMenu,
  itemProjection,
  tabStripNavigation,
  tabStripDragScroll,
  activeClientHostedBrowserRowId,
  itemActions,
  surfaceRef,
  dotsOnly = false
}: {
  props: TabBarProps
  runtime: TabBarRuntimeModel
  createMenu: TabBarCreateMenuController
  itemProjection: TabBarItemProjection
  tabStripNavigation: ReturnType<typeof useTabStripOverflowNavigation>
  tabStripDragScroll: ReturnType<typeof useTabStripDragScrollHandlers>
  activeClientHostedBrowserRowId: string | null
  itemActions: TabBarItemActions
  surfaceRef: (node: HTMLDivElement | null) => void
  /** Deck: the strip hosting the workspace dots shows only the path and dots, no text tabs. */
  dotsOnly?: boolean
}): React.JSX.Element {
  const {
    worktreeId,
    terminalOnly = false,
    showAgentLaunchItems = true,
    onNewTerminalTab,
    onOpenEntry,
    tabStripChrome = 'default'
  } = props
  const {
    resolvedGroupId,
    mobileEmulatorEnabled,
    managedBrowserCreationEnabled,
    mobileEmulatorCreationEnabled,
    workspaceHasSimulatorTab,
    showMobileEmulatorIntroCallout,
    windowsTerminalCapabilities,
    defaultWindowsPowerShellImplementation,
    newTerminalShortcut,
    newBrowserShortcut,
    newSimulatorShortcut,
    newFileShortcut,
    openMarkdownShortcut
  } = runtime
  const {
    agentMenu,
    agentLaunchOptions,
    launchAgentRow,
    newTabMenuOpen,
    setNewTabMenuOpen,
    setCreateMenuQuery,
    createMenuOptions,
    windowsShellEntries,
    handleSelectCreateMenuOption,
    launchAgentFromNewTabEntry,
    runPendingNewTabMenuFocusAfterClose,
    queueNewActiveTerminalFocusAfterNewTabMenuClose,
    queueFocusAfterNewTabMenuClose,
    showStaticCreateMenuItems
  } = createMenu
  const { orderedItems, sortableIds, dropIndicatorByVisibleId } = itemProjection
  const clientHostedBrowserRows = props.clientHostedBrowserRows ?? EMPTY_CLIENT_HOSTED_ROWS
  const {
    tabStripRef,
    tabStripOverflowState,
    activeTabDockSide,
    scrollTabStrip,
    subscribeToStripResize
  } = tabStripNavigation
  const includeTopTabBorder = tabStripChrome !== 'floating-panel'
  const renderedItems = renderTabBarItems({
    items: orderedItems,
    props,
    runtime,
    actions: itemActions,
    dropIndicatorByVisibleId,
    includeTopTabBorder,
    activeClientHostedBrowserRowId
  })

  const newTabMenu = (
    <DropdownMenu
      open={newTabMenuOpen}
      onOpenChange={setNewTabMenuOpen}
      // Why: modal would disable body pointer events, making the Mobile Emulator "Hide" re-enable toast unclickable.
      modal={false}
    >
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          className="mx-1 my-auto shrink-0"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title={translate('auto.components.tab.bar.TabBar.b1a132357f', 'New tab')}
          aria-label={translate('auto.components.tab.bar.TabBar.b1a132357f', 'New tab')}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={6}
        className="w-72 max-w-[calc(100vw-1rem)] rounded-[11px] border-border/80 p-1 shadow-[0_16px_36px_rgba(0,0,0,0.24)]"
        onCloseAutoFocus={(event) => {
          // Why: Radix restores focus to the "+" trigger on close, stealing it from the freshly-mounted terminal.
          event.preventDefault()
          runPendingNewTabMenuFocusAfterClose()
        }}
      >
        {!terminalOnly && onOpenEntry ? (
          <>
            <TabBarCreateEntry
              worktreeId={worktreeId}
              groupId={resolvedGroupId}
              menuOpen={newTabMenuOpen}
              menuOptions={createMenuOptions}
              agentOptions={agentLaunchOptions}
              onLaunchAgentOption={launchAgentFromNewTabEntry}
              onOpenDefaultTerminal={() => {
                queueNewActiveTerminalFocusAfterNewTabMenuClose()
                onNewTerminalTab()
              }}
              onOpenEntry={onOpenEntry}
              onQueryChange={setCreateMenuQuery}
              onQueueSwitchFocus={queueFocusAfterNewTabMenuClose}
              onSelectMenuOption={handleSelectCreateMenuOption}
              onDidOpenEntry={() => setNewTabMenuOpen(false)}
            />
            {showStaticCreateMenuItems ? <DropdownMenuSeparator /> : null}
          </>
        ) : null}
        {showStaticCreateMenuItems ? (
          <TabBarStaticCreateMenu
            props={props}
            terminalOnly={terminalOnly}
            mobileEmulatorEnabled={mobileEmulatorEnabled}
            managedBrowserCreationEnabled={managedBrowserCreationEnabled}
            mobileEmulatorCreationEnabled={mobileEmulatorCreationEnabled}
            workspaceHasSimulatorTab={workspaceHasSimulatorTab}
            showMobileEmulatorIntroCallout={showMobileEmulatorIntroCallout}
            windowsShellEntries={windowsShellEntries}
            defaultWindowsPowerShellImplementation={defaultWindowsPowerShellImplementation}
            pwshAvailable={windowsTerminalCapabilities.pwshAvailable}
            newTerminalShortcut={newTerminalShortcut}
            newBrowserShortcut={newBrowserShortcut}
            newSimulatorShortcut={newSimulatorShortcut}
            newFileShortcut={newFileShortcut}
            openMarkdownShortcut={openMarkdownShortcut}
            queueNewActiveTerminalFocusAfterNewTabMenuClose={
              queueNewActiveTerminalFocusAfterNewTabMenuClose
            }
          />
        ) : null}
        {showStaticCreateMenuItems && showAgentLaunchItems ? (
          <>
            <DropdownMenuSeparator />
            <ProjectedAgentMenuItems model={agentMenu} runLaunch={launchAgentRow} />
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
  if (dotsOnly) {
    // Dots replace the strip, so they need the strip's close routing per content type.
    const closeDotTab = (unifiedTabId: string): void => {
      const item = orderedItems.find((candidate) => candidate.unifiedTabId === unifiedTabId)
      if (!item || item.isPinned) {
        return
      }
      if (item.type === 'browser') {
        itemActions.closeBrowserTab(item.id)
      } else if (item.type === 'editor' || item.type === 'simulator') {
        itemActions.closeFile(item.id)
      } else {
        itemActions.close(item.id)
      }
    }
    return (
      <div ref={surfaceRef} className="deck-tab-bar deck-tab-bar-dots">
        <WorkspaceStripLabel workspaceId={worktreeId} />
        <WorkspaceTabDots
          worktreeId={worktreeId}
          groupId={resolvedGroupId}
          onNewWorkspace={(slotIndex) =>
            useWorkspaceLaunchSelection
              .getState()
              .open(
                worktreeId,
                useAppStore.getState().unifiedTabsByWorktree[worktreeId]?.length ?? 0,
                slotIndex,
                useAppStore.getState().activeGroupIdByWorktree[worktreeId]
              )
          }
          onCloseTab={closeDotTab}
        />
        <div className="deck-tab-bar-dots-end">{newTabMenu}</div>
      </div>
    )
  }
  return (
    <div
      ref={surfaceRef}
      className="deck-tab-bar flex items-stretch h-full overflow-hidden flex-1 min-w-0"
    >
      {tabStripOverflowState.hasOverflow ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="mx-0.5 my-auto h-6 w-5 @max-[260px]/tab-strip:hidden"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              aria-label={translate(
                'auto.components.tab.bar.TabBar.7a9b4af2af',
                'Scroll tabs left'
              )}
              aria-disabled={!tabStripOverflowState.canScrollStart}
              disabled={
                !tabStripDragScroll.isTabDragActive && !tabStripOverflowState.canScrollStart
              }
              onClick={() => scrollTabStrip('start')}
              onPointerEnter={tabStripDragScroll.onDragScrollStartEnter}
              onPointerLeave={tabStripDragScroll.onDragScrollLeave}
            >
              <ChevronLeft className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.tab.bar.TabBar.7a9b4af2af', 'Scroll tabs left')}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {/* Keep drag siblings anchored; only the insertion bar moves. */}
      <SortableContext items={sortableIds}>
        {/* Why: no-drag lets tab interactions work inside the titlebar's drag region (outer container stays window-draggable). */}
        <div
          className="group/tab-strip relative flex min-h-0 min-w-0 max-w-full flex-[0_1_auto]"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <div
            ref={tabStripRef}
            data-active-tab-docked={activeTabDockSide ?? undefined}
            // Why: only `border-r` here — a strip-level `border-l` would render a heavier L-corner than the first tab's own `border-l`.
            className={[
              'terminal-tab-strip flex h-full min-w-0 max-w-full flex-1 items-stretch overflow-x-auto overflow-y-hidden border-r border-border/70',
              getTabStripScrollMaskClassName(tabStripOverflowState, activeTabDockSide)
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <TabStripTooltipProvider>
              {renderedItems}
              {clientHostedBrowserRows.length > 0 ? (
                <ClientHostedBrowserTabRows
                  rows={clientHostedBrowserRows}
                  worktreeId={worktreeId}
                  groupId={resolvedGroupId}
                  groupActiveTabId={props.groupActiveTabId ?? null}
                  includeTopTabBorder={includeTopTabBorder}
                />
              ) : null}
            </TabStripTooltipProvider>
          </div>
          <TabStripScrollIndicator
            hasOverflow={tabStripOverflowState.hasOverflow}
            scrollContainerRef={tabStripRef}
            subscribeToStripResize={subscribeToStripResize}
            disabled={tabStripDragScroll.isTabDragActive}
          />
        </div>
      </SortableContext>
      {tabStripOverflowState.hasOverflow ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon-xs"
              className="mx-0.5 my-auto h-6 w-5 @max-[260px]/tab-strip:hidden"
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              aria-label={translate(
                'auto.components.tab.bar.TabBar.232e075b07',
                'Scroll tabs right'
              )}
              aria-disabled={!tabStripOverflowState.canScrollEnd}
              disabled={!tabStripDragScroll.isTabDragActive && !tabStripOverflowState.canScrollEnd}
              onClick={() => scrollTabStrip('end')}
              onPointerEnter={tabStripDragScroll.onDragScrollEndEnter}
              onPointerLeave={tabStripDragScroll.onDragScrollLeave}
            >
              <ChevronRight className="size-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom" sideOffset={6}>
            {translate('auto.components.tab.bar.TabBar.232e075b07', 'Scroll tabs right')}
          </TooltipContent>
        </Tooltip>
      ) : null}
      {newTabMenu}
      <WorkspaceStripLabel workspaceId={worktreeId} />
    </div>
  )
}
