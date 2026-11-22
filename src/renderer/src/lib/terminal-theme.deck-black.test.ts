import { describe, expect, it } from 'vitest'
import { resolveEffectiveTerminalAppearance } from './terminal-theme'

const base = {
  theme: 'dark',
  terminalThemeDark: 'Ghostty Default Style Dark',
  terminalThemeLight: 'Builtin Tango Light',
  terminalUseSeparateLightTheme: true,
  terminalDividerColorDark: '#3f3f46',
  terminalDividerColorLight: '#d4d4d8',
  terminalCustomThemes: [],
  terminalPluginPalettes: [],
  terminalColorOverrides: undefined,
  terminalColorOverridesLight: undefined
} as unknown as Parameters<typeof resolveEffectiveTerminalAppearance>[0]

describe('Deck black terminal background', () => {
  it('paints a dark palette true black', () => {
    expect(resolveEffectiveTerminalAppearance(base, true).theme?.background).toBe('#000000')
  })

  it('keeps a background the user picked', () => {
    const settings = { ...base, terminalColorOverrides: { background: '#101820' } }
    expect(resolveEffectiveTerminalAppearance(settings, true).theme?.background).toBe('#101820')
  })

  it('keeps the light variant', () => {
    const settings = { ...base, theme: 'light' as const }
    expect(resolveEffectiveTerminalAppearance(settings, false).theme?.background).not.toBe(
      '#000000'
    )
  })

  it('keeps a light palette chosen for the dark slot readable', () => {
    const settings = { ...base, terminalThemeDark: 'Builtin Tango Light' }
    expect(resolveEffectiveTerminalAppearance(settings, true).theme?.background).not.toBe('#000000')
  })
})
