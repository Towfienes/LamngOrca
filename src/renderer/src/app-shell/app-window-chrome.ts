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

// Reserve the top-right chrome for Linux status or Windows window controls.
export const WINDOW_CONTROLS_WIDTH = usesDeckTitlebarStatus
  ? 'min(280px, 40vw)'
  : hasCustomTitleBar
    ? '138px'
    : '0px'
export const WINDOW_CONTROLS_HEIGHT = hasCustomTitleBar ? '36px' : '0px'

// Only macOS desktop windows need left-side traffic-light clearance.
export const hasMacTrafficLights = isMac && !isPairedWebClientWindow()
export const MAC_TRAFFIC_LIGHTS_WIDTH = hasMacTrafficLights ? '80px' : '0px'
