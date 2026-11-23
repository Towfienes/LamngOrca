/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importDeckAppearanceOnce } from './deck-appearance-import'

const profiles = vi.fn()
const settings = vi.fn()
const currentSettings = vi.fn()
const saveUI = vi.fn()

beforeEach(() => {
  localStorage.clear()
  profiles.mockResolvedValue({ activeProfileId: 'local-default' })
  settings.mockResolvedValue({})
  currentSettings.mockResolvedValue({
    leftSidebarAppearanceMode: 'tinted',
    leftSidebarTintOpacity: 0.35,
    terminalThemeDark: 'Ayu Dark',
    terminalDividerColorDark: '#3a3a3a'
  })
  saveUI.mockResolvedValue(undefined)
  vi.stubGlobal('window', {
    api: {
      orcaProfiles: { list: profiles },
      settings: { get: currentSettings, set: settings },
      ui: { setWithAck: saveUI }
    }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('Deck appearance import', () => {
  it('enables mouse focus on an already imported profile without resetting appearance', async () => {
    localStorage.setItem('orca.deckAppearanceImported.v1:local-default', 'true')
    await importDeckAppearanceOnce()
    await importDeckAppearanceOnce()
    expect(settings).toHaveBeenCalledExactlyOnceWith({ terminalFocusFollowsMouse: true })
    expect(saveUI).not.toHaveBeenCalled()
  })
  it('keeps later user edits by importing only once per profile', async () => {
    await importDeckAppearanceOnce()
    await importDeckAppearanceOnce()
    expect(settings).toHaveBeenCalledTimes(2)
    expect(saveUI).toHaveBeenCalledTimes(1)
  })

  it('imports a second profile independently', async () => {
    await importDeckAppearanceOnce()
    profiles.mockResolvedValue({ activeProfileId: 'another-profile' })
    await importDeckAppearanceOnce()
    expect(settings).toHaveBeenCalledTimes(4)
    expect(saveUI).toHaveBeenCalledTimes(2)
  })

  it('retries when saving appearance fails', async () => {
    saveUI.mockRejectedValueOnce(new Error('Could not save UI'))
    await expect(importDeckAppearanceOnce()).rejects.toThrow('Could not save UI')
    await importDeckAppearanceOnce()
    expect(saveUI).toHaveBeenCalledTimes(2)
  })

  it('imports the tinted navy sidebar on a new profile', async () => {
    await importDeckAppearanceOnce()
    expect(settings).toHaveBeenCalledWith(
      expect.objectContaining({
        leftSidebarAppearanceMode: 'tinted',
        leftSidebarTintColor: '#18181b',
        leftSidebarTintOpacity: 0.35
      })
    )
  })

  it('repairs untouched defaults once on an already imported profile', async () => {
    localStorage.setItem('orca.deckAppearanceImported.v1:local-default', 'true')
    currentSettings.mockResolvedValue({
      leftSidebarAppearanceMode: 'default',
      leftSidebarTintOpacity: 0.08,
      terminalThemeDark: '',
      terminalDividerColorDark: '#3f3f46'
    })
    await importDeckAppearanceOnce()
    await importDeckAppearanceOnce()
    expect(settings).toHaveBeenCalledTimes(2)
    expect(settings).toHaveBeenLastCalledWith({
      leftSidebarAppearanceMode: 'tinted',
      leftSidebarTintOpacity: 0.35,
      terminalThemeDark: 'Ayu Dark',
      terminalDividerColorDark: '#3a3a3a'
    })
  })

  it('keeps appearance the user already customized', async () => {
    localStorage.setItem('orca.deckAppearanceImported.v1:local-default', 'true')
    currentSettings.mockResolvedValue({
      leftSidebarAppearanceMode: 'default',
      leftSidebarTintOpacity: 0.2,
      terminalThemeDark: 'Dracula',
      terminalDividerColorDark: '#123456'
    })
    await importDeckAppearanceOnce()
    expect(settings).toHaveBeenCalledExactlyOnceWith({ terminalFocusFollowsMouse: true })
  })

  it('leaves an unsupported bridge untouched', async () => {
    vi.stubGlobal('window', { api: { ui: {} } })
    await importDeckAppearanceOnce()
    expect(settings).not.toHaveBeenCalled()
    expect(profiles).not.toHaveBeenCalled()
  })
})
