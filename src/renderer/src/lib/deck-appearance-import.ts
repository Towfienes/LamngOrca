const DECK_APPEARANCE_IMPORT_KEY = 'orca.deckAppearanceImported.v1'

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
  if (localStorage.getItem(key)) {
    return
  }

  // Import appearance only; later user edits survive subsequent launches.
  await window.api.settings.set({
    leftSidebarTintColor: '#18181b',
    terminalInactivePaneOpacity: 1,
    terminalThemeDark: 'Ayu Dark',
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
