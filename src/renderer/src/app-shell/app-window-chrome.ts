import {
  isPairedWebClientWindow,
  shouldRenderDesktopWindowChrome,
  shouldUseDeckTitlebarStatus
} from '@/lib/desktop-window-chrome'

export const isMac = navigator.userAgent.includes('Mac')
const isWindows = !isMac && navigator.userAgent.includes('Windows')
export const shortcutPlatform: NodeJS.Platform = isMac ? 'darwin' : isWindows ? 'win32' : 'linux'
// Custom chrome belongs to Windows/Linux desktops; paired browser tabs need no window controls.
export const hasCustomTitleBar = shouldRenderDesktopWindowChrome({
  platform: shortcutPlatform,
  isWebClient: isPairedWebClientWindow()
})

export const usesDeckTitlebarStatus = shouldUseDeckTitlebarStatus({
  platform: shortcutPlatform,
  isWebClient: isPairedWebClientWindow()
})

// Windows keeps its window buttons beside the Deck status; Linux uses that corner for status alone.
export const hasWindowControls = hasCustomTitleBar && shortcutPlatform !== 'linux'

// Reserve the top-right chrome for Deck status, window controls, or both on Windows.
export const WINDOW_CONTROLS_WIDTH =
  usesDeckTitlebarStatus && hasWindowControls
    ? 'calc(138px + var(--deck-titlebar-status-width))'
    : usesDeckTitlebarStatus
      ? 'min(280px, 40vw)'
      : hasCustomTitleBar
        ? '138px'
        : '0px'
export const WINDOW_CONTROLS_HEIGHT = hasCustomTitleBar ? '36px' : '0px'

// Only macOS desktop windows need left-side traffic-light clearance.
export const hasMacTrafficLights = isMac && !isPairedWebClientWindow()
export const MAC_TRAFFIC_LIGHTS_WIDTH = hasMacTrafficLights ? '80px' : '0px'
