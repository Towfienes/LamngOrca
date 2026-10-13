/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { importDeckAppearanceOnce } from './deck-appearance-import'

const profiles = vi.fn()
const settings = vi.fn()
const saveUI = vi.fn()

beforeEach(() => {
  localStorage.clear()
  profiles.mockResolvedValue({ activeProfileId: 'local-default' })
  settings.mockResolvedValue({})
  saveUI.mockResolvedValue(undefined)
  vi.stubGlobal('window', {
    api: {
      orcaProfiles: { list: profiles },
      settings: { set: settings },
      ui: { setWithAck: saveUI }
    }
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetAllMocks()
})

describe('Deck appearance import', () => {
  it('keeps later user edits by importing only once per profile', async () => {
    await importDeckAppearanceOnce()
    await importDeckAppearanceOnce()
    expect(settings).toHaveBeenCalledTimes(1)
    expect(saveUI).toHaveBeenCalledTimes(1)
  })

  it('imports a second profile independently', async () => {
    await importDeckAppearanceOnce()
    profiles.mockResolvedValue({ activeProfileId: 'another-profile' })
    await importDeckAppearanceOnce()
    expect(settings).toHaveBeenCalledTimes(2)
    expect(saveUI).toHaveBeenCalledTimes(2)
  })

  it('retries when saving appearance fails', async () => {
    saveUI.mockRejectedValueOnce(new Error('Could not save UI'))
    await expect(importDeckAppearanceOnce()).rejects.toThrow('Could not save UI')
    await importDeckAppearanceOnce()
    expect(saveUI).toHaveBeenCalledTimes(2)
  })

  it('leaves an unsupported bridge untouched', async () => {
    vi.stubGlobal('window', { api: { ui: {} } })
    await importDeckAppearanceOnce()
    expect(settings).not.toHaveBeenCalled()
    expect(profiles).not.toHaveBeenCalled()
  })
})
