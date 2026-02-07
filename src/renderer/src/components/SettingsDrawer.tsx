import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CharacterCard } from './CharacterCard'
import type { AppSettings, CharacterConfig } from '../../../shared/types'

interface SettingsDrawerProps {
  isOpen: boolean
  onClose: () => void
  settings: AppSettings
  presets: CharacterConfig[]
  onSave: (settings: AppSettings) => void
}

function makeCustomCharacter(): CharacterConfig {
  return {
    id: `custom-${Date.now()}`,
    name: 'New Character',
    color: '#888888',
    enabled: true,
    systemPrompt:
      'You are a witty commentator watching a conversation between a human and an AI. Keep responses to 1-2 sentences.',
    temperature: 0.9,
    maxTokens: 100,
    reactionChance: 0.5,
    reactionToOtherChance: 0.3,
  }
}

export function SettingsDrawer({
  isOpen,
  onClose,
  settings,
  presets,
  onSave,
}: SettingsDrawerProps): React.JSX.Element {
  const [draft, setDraft] = useState<CharacterConfig[]>(settings.activeCharacters)
  const [showPresetPicker, setShowPresetPicker] = useState(false)

  const presetIds = new Set(presets.map((p) => p.id))
  const activeIds = new Set(draft.map((c) => c.id))
  const availablePresets = presets.filter((p) => !activeIds.has(p.id))

  function updateCharacter(index: number, updated: CharacterConfig): void {
    const next = [...draft]
    next[index] = updated
    setDraft(next)
  }

  function removeCharacter(index: number): void {
    setDraft(draft.filter((_, i) => i !== index))
  }

  function addPreset(preset: CharacterConfig): void {
    setDraft([...draft, preset])
    setShowPresetPicker(false)
  }

  function addCustom(): void {
    setDraft([...draft, makeCustomCharacter()])
  }

  function handleSave(): void {
    onSave({ activeCharacters: draft })
    onClose()
  }

  function handleCancel(): void {
    setDraft(settings.activeCharacters)
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="absolute inset-0 z-50 flex flex-col"
          style={{ backgroundColor: 'rgba(30, 30, 30, 0.95)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/10">
            <span className="text-white/80 text-[13px] font-semibold">Settings</span>
            <button
              onClick={handleCancel}
              className="text-white/40 hover:text-white/70 text-[12px]"
            >
              {'\u2715'}
            </button>
          </div>

          {/* Character list */}
          <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2 scrollbar-thin">
            <span className="text-white/40 text-[10px] uppercase tracking-wider px-1">
              Active characters ({draft.length})
            </span>

            {draft.map((character, i) => (
              <CharacterCard
                key={character.id}
                character={character}
                isCustom={!presetIds.has(character.id)}
                onChange={(updated) => updateCharacter(i, updated)}
                onRemove={() => removeCharacter(i)}
                onDelete={() => removeCharacter(i)}
              />
            ))}

            {/* Add buttons */}
            <div className="flex gap-2 mt-1">
              {availablePresets.length > 0 && (
                <div className="relative flex-1">
                  <button
                    onClick={() => setShowPresetPicker(!showPresetPicker)}
                    className="w-full rounded-lg py-1.5 text-[11px] text-white/50 hover:text-white/70 bg-white/5 hover:bg-white/10"
                  >
                    + Add preset
                  </button>
                  {showPresetPicker && (
                    <div
                      className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-10"
                      style={{ backgroundColor: 'rgba(50, 50, 50, 0.95)' }}
                    >
                      {availablePresets.map((preset) => (
                        <button
                          key={preset.id}
                          onClick={() => addPreset(preset)}
                          className="w-full text-left px-3 py-1.5 text-[11px] text-white/70 hover:bg-white/10 flex items-center gap-2"
                        >
                          <span
                            className="w-2 h-2 rounded-full inline-block"
                            style={{ backgroundColor: preset.color }}
                          />
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <button
                onClick={addCustom}
                className="flex-1 rounded-lg py-1.5 text-[11px] text-white/50 hover:text-white/70 bg-white/5 hover:bg-white/10"
              >
                + Custom
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-3 py-2 border-t border-white/10">
            <button
              onClick={handleCancel}
              className="flex-1 rounded-lg py-1.5 text-[11px] text-white/50 hover:text-white/70 bg-white/5"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex-1 rounded-lg py-1.5 text-[11px] text-white/90 bg-white/15 hover:bg-white/20"
            >
              Save
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
