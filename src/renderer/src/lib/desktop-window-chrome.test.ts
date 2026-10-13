import { describe, expect, it } from 'vitest'
import {
  shouldRenderDesktopWindowChrome,
  shouldUseDeckTitlebarStatus
} from './desktop-window-chrome'

describe('shouldRenderDesktopWindowChrome', () => {
  it('renders custom chrome for frameless desktop Linux and Windows windows', () => {
    expect(shouldRenderDesktopWindowChrome({ platform: 'linux', isWebClient: false })).toBe(true)
    expect(shouldRenderDesktopWindowChrome({ platform: 'win32', isWebClient: false })).toBe(true)
  })

  it('keeps macOS on native traffic lights', () => {
    expect(shouldRenderDesktopWindowChrome({ platform: 'darwin', isWebClient: false })).toBe(false)
  })

  it('does not render desktop-only window controls in the paired web client', () => {
    expect(shouldRenderDesktopWindowChrome({ platform: 'linux', isWebClient: true })).toBe(false)
    expect(shouldRenderDesktopWindowChrome({ platform: 'win32', isWebClient: true })).toBe(false)
  })
})

describe('Deck titlebar status', () => {
  it('replaces Linux desktop buttons while preserving other platforms and web clients', () => {
    expect(shouldUseDeckTitlebarStatus({ platform: 'linux', isWebClient: false })).toBe(true)
    expect(shouldUseDeckTitlebarStatus({ platform: 'linux', isWebClient: true })).toBe(false)
    expect(shouldUseDeckTitlebarStatus({ platform: 'win32', isWebClient: false })).toBe(false)
    expect(shouldUseDeckTitlebarStatus({ platform: 'darwin', isWebClient: false })).toBe(false)
  })
})
