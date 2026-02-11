import { useState } from 'react'
import type { CharacterConfig } from '../../../shared/types'

interface CharacterCardProps {
  character: CharacterConfig
  isCustom: boolean
  onChange: (updated: CharacterConfig) => void
  onRemove: () => void
  onDelete?: () => void
}

export function CharacterCard({
  character,
  isCustom,
  onChange,
  onRemove,
  onDelete,
}: CharacterCardProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="rounded-lg p-2.5 text-[12px]"
      style={{
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderLeft: `2px solid ${character.enabled ? character.color : 'rgba(255,255,255,0.15)'}`,
        opacity: character.enabled ? 1 : 0.5,
      }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1.5 text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="font-semibold text-white/90">{character.name}</span>
          <span className="text-white/40 text-[10px]">{expanded ? '\u25B2' : '\u25BC'}</span>
        </button>
        <div className="flex items-center gap-2">
          {/* Enable/disable toggle */}
          <button
            onClick={() => onChange({ ...character, enabled: !character.enabled })}
            className={`w-7 h-4 rounded-full relative transition-colors ${
              character.enabled ? 'bg-green-500/60' : 'bg-white/15'
            }`}
          >
            <span
              className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
                character.enabled ? 'left-3.5' : 'left-0.5'
              }`}
            />
          </button>
          {/* Remove (preset) or Delete (custom) */}
          {isCustom ? (
            <button
              onClick={onDelete}
              className="text-white/30 hover:text-red-400 text-[10px] px-1"
              title="Delete character"
            >
              {'\u2715'}
            </button>
          ) : (
            <button
              onClick={onRemove}
              className="text-white/30 hover:text-white/50 text-[10px] px-1"
              title="Remove from roster"
            >
              {'\u2212'}
            </button>
          )}
        </div>
      </div>

      {/* Expanded settings */}
      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          <label className="flex flex-col gap-0.5">
            <span className="text-white/40 text-[10px] uppercase tracking-wider">Name</span>
            <input
              type="text"
              value={character.name}
              onChange={(e) => onChange({ ...character, name: e.target.value })}
              className="bg-white/5 rounded px-2 py-1 text-white/90 text-[12px] outline-none focus:bg-white/10"
            />
          </label>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2">
              <span className="text-white/40 text-[10px] uppercase tracking-wider">Color</span>
              <input
                type="color"
                value={character.color}
                onChange={(e) => onChange({ ...character, color: e.target.value })}
                className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
              />
            </label>
            <label className="flex items-center gap-2">
              <span className="text-white/40 text-[10px] uppercase tracking-wider">Avatar</span>
              <input
                type="text"
                value={character.avatar}
                onChange={(e) => onChange({ ...character, avatar: e.target.value })}
                className="w-8 bg-white/5 rounded px-1 py-0.5 text-center text-[14px] outline-none focus:bg-white/10"
              />
            </label>
          </div>

          <label className="flex flex-col gap-0.5">
            <span className="text-white/40 text-[10px] uppercase tracking-wider">
              Reaction chance ({Math.round(character.reactionChance * 100)}%)
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={character.reactionChance}
              onChange={(e) =>
                onChange({ ...character, reactionChance: parseFloat(e.target.value) })
              }
              className="accent-white/60"
            />
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-white/40 text-[10px] uppercase tracking-wider">
              React to others ({Math.round(character.reactionToOtherChance * 100)}%)
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={character.reactionToOtherChance}
              onChange={(e) =>
                onChange({ ...character, reactionToOtherChance: parseFloat(e.target.value) })
              }
              className="accent-white/60"
            />
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-white/40 text-[10px] uppercase tracking-wider">
              Temperature ({character.temperature.toFixed(2)})
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={character.temperature}
              onChange={(e) => onChange({ ...character, temperature: parseFloat(e.target.value) })}
              className="accent-white/60"
            />
          </label>

          <label className="flex flex-col gap-0.5">
            <span className="text-white/40 text-[10px] uppercase tracking-wider">
              System prompt
            </span>
            <textarea
              value={character.systemPrompt}
              onChange={(e) => onChange({ ...character, systemPrompt: e.target.value })}
              rows={4}
              className="bg-white/5 rounded px-2 py-1 text-white/80 text-[11px] leading-snug outline-none focus:bg-white/10 resize-y"
            />
          </label>
        </div>
      )}
    </div>
  )
}
