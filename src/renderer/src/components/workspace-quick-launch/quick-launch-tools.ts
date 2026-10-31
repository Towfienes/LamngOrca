import { Code2, Globe, Smartphone, TerminalSquare } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import type { QuickLaunchTool } from '../../../../shared/workspace-quick-launch'
export const TOOL_ICONS = {
  terminal: TerminalSquare,
  vscode: Code2,
  browser: Globe,
  emulator: Smartphone
}
export function toolLabel(tool: QuickLaunchTool): string {
  switch (tool) {
    case 'terminal':
      return translate('quickLaunch.terminal', 'Terminal')
    case 'vscode':
      return translate('vscodeEditor.name', 'VS Code')
    case 'browser':
      return translate('quickLaunch.browser', 'Orca Browser')
    case 'emulator':
      return translate('quickLaunch.emulator', 'Emulator')
  }
}
