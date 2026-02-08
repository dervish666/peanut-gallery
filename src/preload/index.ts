import { contextBridge, ipcRenderer } from 'electron'
import type { CommentEvent, NowShowingEvent, AppSettings, CharacterConfig } from '../shared/types'

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
  onCommentsClear: (callback: () => void): (() => void) => {
    const handler = (): void => {
      callback()
    }
    ipcRenderer.on('comments:clear', handler)
    return () => {
      ipcRenderer.removeListener('comments:clear', handler)
    }
  },
  onNowShowing: (callback: (event: NowShowingEvent) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, event: NowShowingEvent): void => {
      callback(event)
    }
    ipcRenderer.on('now-showing:update', handler)
    return () => {
      ipcRenderer.removeListener('now-showing:update', handler)
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
  minimize: (): void => {
    ipcRenderer.send('window:minimize')
  },
}

contextBridge.exposeInMainWorld('api', api)
