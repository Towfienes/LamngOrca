import { describe, expect, it } from 'vitest'
import {
  applyVSCodeEditorPerformanceSettings,
  buildVSCodeEditorSettings,
  vscodeWorkspaceId
} from './vscode-profile'

describe('embedded VS Code profile', () => {
  it('skips the Python analysis server and upgrades existing embedded settings without resetting their preferences', () => {
    const original = {
      'editor.fontFamily': 'Dank Mono',
      'customExtension.value': 'keep',
      'claudeCode.selectedModel': 'keep',
      'python.analysis.languageServerMode': 'full',
      'python.analysis.indexing': true
    }
    const result = applyVSCodeEditorPerformanceSettings(original)
    expect(result).toMatchObject({
      'editor.fontFamily': 'Dank Mono',
      'customExtension.value': 'keep',
      'claudeCode.selectedModel': 'keep',
      'python.languageServer': 'None',
      'python.analysis.languageServerMode': 'full',
      'python.analysis.indexing': true
    })
    expect(original['python.analysis.languageServerMode']).toBe('full')
    expect(buildVSCodeEditorSettings({})['python.languageServer']).toBe('None')
  })
  it('imports editor appearance without accounts, executable CSS or agent settings', () => {
    const source = {
      'editor.fontFamily': 'Dank Mono',
      'editor.fontSize': 14,
      'editor.minimap.enabled': true,
      'workbench.editor.showTabs': 'single',
      'workbench.colorTheme': 'Caelestia',
      'custom-ui-style.stylesheet': { body: 'display:none' },
      'github.copilot.enable': true,
      'claudeCode.selectedModel': 'private',
      '[python]': { 'editor.tabSize': 4, 'claudeCode.selectedModel': 'private' },
      'terminal.integrated.env.linux': { SECRET: 'private' }
    }
    const settings = buildVSCodeEditorSettings(source)
    expect(settings['editor.fontFamily']).toBe('Dank Mono')
    expect(settings['workbench.colorTheme']).toBe('Caelestia')
    expect(settings['workbench.editor.showTabs']).toBe('none')
    expect(settings['editor.minimap.enabled']).toBe(false)
    expect(settings['workbench.statusBar.visible']).toBe(false)
    expect(settings['custom-ui-style.stylesheet']).toBeUndefined()
    expect(settings['terminal.integrated.env.linux']).toBeUndefined()
    expect(settings['claudeCode.selectedModel']).toBeUndefined()
    expect(settings['github.copilot.enable']).toBeUndefined()
    expect(settings['[python]']).toEqual({ 'editor.tabSize': 4 })
    expect(source['editor.minimap.enabled']).toBe(true)
  })

  it('keeps the recovery workspace stable per Orca pane and never uses paths as names', () => {
    expect(vscodeWorkspaceId('/repo\0pane')).toBe(vscodeWorkspaceId('/repo\0pane'))
    expect(vscodeWorkspaceId('/repo\0pane')).not.toBe(vscodeWorkspaceId('/repo\0other'))
    expect(vscodeWorkspaceId('../../repo')).toMatch(/^[a-f0-9]{32}$/)
  })
})
