import { ElectronAPI } from '@electron-toolkit/preload'
import type { PeanutGalleryAPI } from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: PeanutGalleryAPI
  }
}
