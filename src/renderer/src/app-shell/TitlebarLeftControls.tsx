import { PanelLeft } from 'lucide-react'
import logo from '../../../../resources/logo.svg'
import { translate } from '@/i18n/i18n'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@/components/ui/context-menu'
import { useShortcutLabel } from '../hooks/useShortcutLabel'
import { useAppStore } from '../store'
import { hasCustomTitleBar, isMac } from './app-window-chrome'
import type { AppChromeLayout } from './use-app-chrome-layout'
import { LamngSignature } from './LamngSignature'
import { cn } from '@/lib/utils'

/** Shared titlebar cluster: native chrome, Orca logo, sidebar toggle and Lamng identity. */
export function TitlebarLeftControls({ layout }: { layout: AppChromeLayout }): React.JSX.Element {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar)
  const updateSettings = useAppStore((s) => s.updateSettings)
  const leftSidebarShortcutLabel = useShortcutLabel('sidebar.left.toggle')

  return (
    // Why: measure the ENTIRE row so TabGroupPanel's collapse spacer reserves enough width; measuring only the inner cluster left back/forward over the first tab.
    // Why: collapsed mode floats in a w-0 wrapper; w-max stops Windows Chromium from shrinking the app name to one glyph.
    <div
      ref={layout.titlebarLeftControlsRef}
      className={cn(
        'flex h-full min-w-0 shrink-0 items-center',
        layout.leftTitlebarChromeLayout.isFloating ? 'w-max' : 'w-full'
      )}
    >
      <div className="flex h-full items-center">
        {isMac && !layout.isFullScreen ? (
          <div className="titlebar-traffic-light-pad" />
        ) : hasCustomTitleBar ? (
          <img src={logo} alt="" aria-hidden className="titlebar-logo" />
        ) : (
          <div className="pl-2" />
        )}
        {layout.showSidebar && !hasCustomTitleBar && layout.showTitlebarAppName && (
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                className="titlebar-app-name"
                aria-label={translate('auto.App.5096cbbc86', 'Orca')}
              >
                <span className="titlebar-app-name-main">
                  {translate('auto.App.5096cbbc86', 'Orca')}
                </span>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onSelect={() => {
                  void updateSettings({ showTitlebarAppName: false })
                }}
              >
                {translate('auto.App.e81217c1b7', 'Hide App Name')}
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        )}
        {layout.showSidebar && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                className="sidebar-toggle"
                onClick={toggleSidebar}
                aria-label={translate('auto.App.e4b9e7dff7', 'Toggle sidebar')}
              >
                <PanelLeft size={16} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {translate('auto.App.ce37cf5279', 'Toggle sidebar ({{value0}})', {
                value0: leftSidebarShortcutLabel
              })}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      {layout.showSidebar && (
        <div className="deck-lamng-brand">
          <Tooltip>
            <TooltipTrigger asChild>
              {/* Why: the signature took over the removed avatar's application-menu role. */}
              <button
                className="deck-signature-button"
                aria-label={translate('auto.App.8b0b8eb54f', 'Application menu')}
                onClick={() => window.api.ui.popupMenu()}
              >
                <LamngSignature />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {translate('auto.App.8b0b8eb54f', 'Application menu')}
            </TooltipContent>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
