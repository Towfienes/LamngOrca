import { createHash } from 'node:crypto'

export const VSCODE_EDITOR_PERFORMANCE_SETTINGS = {
  'python.languageServer': 'None',
  'extensions.ignoreRecommendations': true
} as const

export function applyVSCodeEditorPerformanceSettings(
  settings: Record<string, unknown>
): Record<string, unknown> {
  return { ...settings, ...VSCODE_EDITOR_PERFORMANCE_SETTINGS }
}

export function vscodeWorkspaceId(paneKey: string): string {
  return createHash('sha256').update(paneKey).digest('hex').slice(0, 32)
}

export function buildVSCodeEditorSettings(
  source: Record<string, unknown>
): Record<string, unknown> {
  const settings = Object.fromEntries(
    Object.entries(source)
      .filter(([key]) =>
        /^(editor\.|notebook\.|\[\w+\]$|workbench\.(colorTheme|iconTheme)$)/.test(key)
      )
      .map(([key, value]): [string, unknown] => [
        key,
        key.startsWith('[') && value !== null && typeof value === 'object' && !Array.isArray(value)
          ? Object.fromEntries(
              Object.entries(value).filter(([setting]) => setting.startsWith('editor.'))
            )
          : value
      ])
  )
  return {
    ...settings,
    ...VSCODE_EDITOR_PERFORMANCE_SETTINGS,
    'workbench.colorTheme': settings['workbench.colorTheme'] ?? 'Default Dark Modern',
    'workbench.experimental.modernUI': false,
    'workbench.editor.showTabs': 'none',
    'workbench.statusBar.visible': false,
    'workbench.activityBar.location': 'hidden',
    'workbench.startupEditor': 'none',
    'workbench.tips.enabled': false,
    'chat.disableAIFeatures': true,
    'workbench.editor.enablePreview': false,
    'workbench.editor.restoreViewState': true,
    'workbench.layoutControl.enabled': false,
    'breadcrumbs.enabled': false,
    'editor.minimap.enabled': false,
    'editor.stickyScroll.enabled': false,
    'editor.scrollbar.vertical': 'hidden',
    'editor.scrollbar.horizontal': 'hidden',
    'editor.overviewRulerLanes': 0,
    'editor.overviewRulerBorder': false,
    'editor.guides.indentation': false,
    'window.commandCenter': false,
    'window.customTitleBarVisibility': 'never',
    'window.menuBarVisibility': 'hidden',
    'zenMode.fullScreen': false,
    'zenMode.centerLayout': false,
    'zenMode.hideLineNumbers': false,
    'zenMode.showTabs': 'none',
    'zenMode.restore': false,
    'telemetry.telemetryLevel': 'off',
    'extensions.autoUpdate': false,
    'extensions.autoCheckUpdates': false,
    'files.autoSave': 'off'
  }
}
