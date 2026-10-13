import {
  isPairedWebClientWindow,
  shouldRenderDesktopWindowChrome,
  shouldUseDeckTitlebarStatus
} from '@/lib/desktop-window-chrome'

export const isMac = navigator.userAgent.includes('Mac')
const isWindows = !isMac && navigator.userAgent.includes('Windows')
export const shortcutPlatform: NodeJS.Platform = isMac ? 'darwin' : isWindows ? 'win32' : 'linux'
// Why: Windows and Linux remove the native title bar so the renderer draws its own chrome; paired web clients run in a browser tab and must not.
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

// Why: macOS paints traffic lights on the window's top-left edge. Windows and Linux paint their
// controls on the right, so only macOS needs a surface to keep the left edge uncovered.
export const MAC_TRAFFIC_LIGHTS_WIDTH = isMac ? '80px' : '0px'
