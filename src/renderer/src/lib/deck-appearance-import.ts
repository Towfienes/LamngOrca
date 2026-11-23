import { DEFAULT_LEFT_SIDEBAR_TINT_OPACITY } from '../../../shared/left-sidebar-appearance'
import { DEFAULT_TERMINAL_DIVIDER_DARK } from './terminal-theme'

const DECK_APPEARANCE_IMPORT_KEY = 'orca.deckAppearanceImported.v1'
const DECK_APPEARANCE_REPAIR_KEY = 'orca.deckAppearanceRepaired.v1'
const DECK_SIDEBAR_TINT = {
  leftSidebarAppearanceMode: 'tinted',
  leftSidebarTintOpacity: 0.35
} as const
const DECK_TERMINAL_THEME = 'Ayu Dark'
const DECK_TERMINAL_DIVIDER = '#3a3a3a'

// Why: older imports left the shell on the grey default; only untouched values are upgraded.
async function repairDeckAppearanceDefaults(profileId: string): Promise<void> {
  const key = `${DECK_APPEARANCE_REPAIR_KEY}:${profileId}`
  if (localStorage.getItem(key)) {
    return
  }
  const current = await window.api.settings.get()
  const patch = {
    ...(current.leftSidebarAppearanceMode !== 'tinted' &&
    current.leftSidebarTintOpacity === DEFAULT_LEFT_SIDEBAR_TINT_OPACITY
      ? DECK_SIDEBAR_TINT
      : {}),
    ...(current.terminalThemeDark ? {} : { terminalThemeDark: DECK_TERMINAL_THEME }),
    ...(current.terminalDividerColorDark === DEFAULT_TERMINAL_DIVIDER_DARK
      ? { terminalDividerColorDark: DECK_TERMINAL_DIVIDER }
      : {})
  }
  if (Object.keys(patch).length > 0) {
    await window.api.settings.set(patch)
  }
  localStorage.setItem(key, 'true')
}

export async function importDeckAppearanceOnce(): Promise<void> {
  const saveUI = window.api.ui.setWithAck
  if (!saveUI) {
    return
  }
  const { activeProfileId } = await window.api.orcaProfiles.list()
  const focusKey = `orca.deckMouseFocusImported.v1:${activeProfileId}`
  if (!localStorage.getItem(focusKey)) {
    await window.api.settings.set({ terminalFocusFollowsMouse: true })
    localStorage.setItem(focusKey, 'true')
  }
  const key = `${DECK_APPEARANCE_IMPORT_KEY}:${activeProfileId}`
  if (!localStorage.getItem(key)) {
    // Import appearance only; later user edits survive subsequent launches.
    await window.api.settings.set({
      ...DECK_SIDEBAR_TINT,
      leftSidebarTintColor: '#18181b',
      terminalInactivePaneOpacity: 1,
      terminalThemeDark: DECK_TERMINAL_THEME,
      tabAutoGenerateTitle: true
    })
    await saveUI({
      agentActivityDisplayMode: 'full',
      sidebarWidth: 305,
      rightSidebarWidth: 348,
      rightSidebarOpen: true,
      uiZoomLevel: 2.5
    })
    localStorage.setItem(key, 'true')
  }
  await repairDeckAppearanceDefaults(activeProfileId)
}
