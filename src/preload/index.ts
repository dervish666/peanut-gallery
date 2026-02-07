import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { CommentEvent, AppSettings, CharacterConfig } from '../shared/types'

const api = {
  onComment: (callback: (event: CommentEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, comment: CommentEvent): void => {
      callback(comment)
    }
    ipcRenderer.on('comment:new', handler)
    return () => {
      ipcRenderer.removeListener('comment:new', handler)
    }
  },
  onStatus: (callback: (status: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, status: string): void => {
      callback(status)
    }
    ipcRenderer.on('status:update', handler)
    return () => {
      ipcRenderer.removeListener('status:update', handler)
    }
  },
  getSettings: (): Promise<AppSettings> => {
    return ipcRenderer.invoke('settings:get')
  },
  setSettings: (settings: AppSettings): Promise<void> => {
    return ipcRenderer.invoke('settings:set', settings)
  },
  getPresetCharacters: (): Promise<CharacterConfig[]> => {
    return ipcRenderer.invoke('characters:get-presets')
  },
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
