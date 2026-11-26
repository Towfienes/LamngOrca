import { ipcRenderer } from 'electron'
import type { PreloadApi } from '../api-types'

export const deeprelayApi = {
  list: () => ipcRenderer.invoke('deeprelay:list'),
  sessions: () => ipcRenderer.invoke('deeprelay:sessions')
} satisfies PreloadApi['deeprelay']
