import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const claude9Api = {
  list: (args?: { force?: boolean }) => ipcRenderer.invoke('claude9:list', args),
  sessions: () => ipcRenderer.invoke('claude9:sessions')
} satisfies PreloadApi['claude9']
