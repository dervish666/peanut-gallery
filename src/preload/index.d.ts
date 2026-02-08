import type { PeanutGalleryAPI } from '../shared/types'

declare global {
  interface Window {
    api: PeanutGalleryAPI
  }
}
