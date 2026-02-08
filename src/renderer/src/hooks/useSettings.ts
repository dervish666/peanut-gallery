import { useState, useEffect, useCallback } from 'react'
import type { AppSettings, CharacterConfig } from '../../../shared/types'

export function useSettings(): {
  settings: AppSettings | null
  presets: CharacterConfig[]
  isLoading: boolean
  saveSettings: (newSettings: AppSettings) => Promise<void>
} {
  const [settings, setSettingsState] = useState<AppSettings | null>(null)
  const [presets, setPresets] = useState<CharacterConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Promise.all([window.api.getSettings(), window.api.getPresetCharacters()])
      .then(([s, p]) => {
        setSettingsState(s)
        setPresets(p)
      })
      .catch((err) => {
        console.error('[useSettings] Failed to load settings:', err)
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  const saveSettings = useCallback(async (newSettings: AppSettings) => {
    setSettingsState(newSettings)
    try {
      await window.api.setSettings(newSettings)
    } catch (err) {
      console.error('[useSettings] Failed to save settings:', err)
    }
  }, [])

  return { settings, presets, isLoading, saveSettings }
}
