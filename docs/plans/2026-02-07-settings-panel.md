# Settings Panel Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a settings drawer to the overlay where users can choose how many characters are in the peanut gallery, pick from presets or create custom characters, and tweak each character's settings — all persisted across restarts via electron-store.

**Architecture:** Settings are stored in electron-store on the main process and exposed to the renderer via IPC (`settings:get` / `settings:set`). The renderer has a slide-out drawer (Framer Motion) that overlays the comment feed. Characters are defined as a `CharacterConfig[]` in settings — the hardcoded `characters` array becomes the default, not the source of truth. The `CharacterEngine` accepts a dynamic character list instead of importing the static array.

**Tech Stack:** electron-store (persistence), React + Tailwind + Framer Motion (drawer UI), existing IPC pattern.

---

## Data Model

The settings object stored in electron-store:

```typescript
// src/shared/types.ts additions
interface AppSettings {
  activeCharacters: CharacterConfig[] // the current roster
}
```

Default value: the three preset characters `[waldorf, statler, dave]`.

The preset roster (all available built-in characters) stays in `src/characters/` as a reference catalogue — users pick from these or create new ones.

---

### Task 1: Install electron-store

**Files:**

- Modify: `package.json`

**Step 1: Install**

Run: `npm install electron-store`

**Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add electron-store for settings persistence"
```

---

### Task 2: Add settings types and preload API

**Files:**

- Modify: `src/shared/types.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/preload/index.d.ts`

**Step 1: Extend shared types**

Add to `src/shared/types.ts`:

```typescript
export interface AppSettings {
  activeCharacters: CharacterConfig[]
}
```

**Step 2: Extend PeanutGalleryAPI**

Update the `PeanutGalleryAPI` interface in `src/shared/types.ts`:

```typescript
export interface PeanutGalleryAPI {
  onComment: (callback: (event: CommentEvent) => void) => () => void
  onStatus: (callback: (status: string) => void) => () => void
  getSettings: () => Promise<AppSettings>
  setSettings: (settings: AppSettings) => Promise<void>
  getPresetCharacters: () => Promise<CharacterConfig[]>
}
```

**Step 3: Wire preload IPC**

In `src/preload/index.ts`, add to the `api` object:

```typescript
getSettings: (): Promise<AppSettings> => {
  return ipcRenderer.invoke('settings:get')
},
setSettings: (settings: AppSettings): Promise<void> => {
  return ipcRenderer.invoke('settings:set', settings)
},
getPresetCharacters: (): Promise<CharacterConfig[]> => {
  return ipcRenderer.invoke('characters:get-presets')
},
```

Add the `AppSettings` import alongside the existing `CommentEvent` import.

**Step 4: Update preload type declaration**

`src/preload/index.d.ts` already imports `PeanutGalleryAPI` — no changes needed since the interface is updated in types.ts.

**Step 5: Verify**

Run: `npm run typecheck`
Expected: Fails on main process (IPC handlers not yet registered). Preload + renderer + types should be fine.

**Step 6: Commit**

```bash
git add src/shared/types.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "feat: add settings types and preload IPC bridge"
```

---

### Task 3: Main process — electron-store + IPC handlers

**Files:**

- Modify: `src/main/index.ts`
- Modify: `src/main/characters.ts`

**Step 1: Set up electron-store and IPC handlers in index.ts**

Add imports at top of `src/main/index.ts`:

```typescript
import { ipcMain } from 'electron' // add to existing electron import
import Store from 'electron-store'
import { characters as presetCharacters } from '../characters'
import type { AppSettings, CharacterConfig } from '../shared/types'
```

Create the store after the existing module-level variables:

```typescript
const store = new Store<AppSettings>({
  defaults: {
    activeCharacters: presetCharacters,
  },
})
```

Register IPC handlers inside `app.whenReady().then(...)`, before `createWindow()`:

```typescript
ipcMain.handle('settings:get', (): AppSettings => {
  return {
    activeCharacters: store.get('activeCharacters'),
  }
})

ipcMain.handle('settings:set', (_event, settings: AppSettings): void => {
  store.set('activeCharacters', settings.activeCharacters)
  // Hot-reload: update the engine's character list
  if (engine) {
    engine.setCharacters(settings.activeCharacters)
  }
})

ipcMain.handle('characters:get-presets', (): CharacterConfig[] => {
  return presetCharacters
})
```

**Step 2: Make CharacterEngine accept dynamic characters**

In `src/main/characters.ts`:

- Remove the static `import { characters } from '../characters'` at the top.
- Add a `characters` instance field and a `setCharacters` method:

```typescript
export class CharacterEngine {
  private client: Anthropic
  private characters: CharacterConfig[]
  private lastCommentTime: number = 0
  private cooldownMs: number = 10000
  private roundCounter: number = 0

  constructor(apiKey: string, characters: CharacterConfig[]) {
    this.client = new Anthropic({ apiKey })
    this.characters = characters
  }

  setCharacters(characters: CharacterConfig[]): void {
    this.characters = characters
  }
  // ... rest unchanged, but replace `characters` loop with `this.characters`
```

In the `generateCommentary` method, change `for (const character of characters)` to `for (const character of this.characters)`.

**Step 3: Update engine construction in index.ts**

Where the engine is created in `startAccessibilityReader`:

```typescript
engine = new CharacterEngine(apiKey, store.get('activeCharacters'))
```

**Step 4: Verify**

Run: `npm run typecheck`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/index.ts src/main/characters.ts
git commit -m "feat: electron-store settings with IPC handlers, dynamic character list"
```

---

### Task 4: Settings drawer — useSettings hook

**Files:**

- Create: `src/renderer/src/hooks/useSettings.ts`

**Step 1: Create the hook**

```typescript
import { useState, useEffect, useCallback } from 'react'
import type { AppSettings, CharacterConfig } from '../../../shared/types'

export function useSettings() {
  const [settings, setSettingsState] = useState<AppSettings | null>(null)
  const [presets, setPresets] = useState<CharacterConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    Promise.all([window.api.getSettings(), window.api.getPresetCharacters()]).then(([s, p]) => {
      setSettingsState(s)
      setPresets(p)
      setIsLoading(false)
    })
  }, [])

  const saveSettings = useCallback(async (newSettings: AppSettings) => {
    setSettingsState(newSettings)
    await window.api.setSettings(newSettings)
  }, [])

  return { settings, presets, isLoading, saveSettings }
}
```

**Step 2: Verify**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/src/hooks/useSettings.ts
git commit -m "feat: useSettings hook for renderer settings access"
```

---

### Task 5: Settings drawer — CharacterCard component

**Files:**

- Create: `src/renderer/src/components/CharacterCard.tsx`

This is a compact card showing one character in the active roster with inline-editable fields.

**Step 1: Create the component**

```typescript
import { useState } from 'react'
import type { CharacterConfig } from '../../../shared/types'

interface CharacterCardProps {
  character: CharacterConfig
  onChange: (updated: CharacterConfig) => void
  onRemove: () => void
}

export function CharacterCard({ character, onChange, onRemove }: CharacterCardProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="rounded-lg p-2.5 text-[12px]"
      style={{
        backgroundColor: 'rgba(255,255,255,0.07)',
        borderLeft: `2px solid ${character.color}`,
      }}
    >
      {/* Header row: name, color dot, remove button */}
      <div className="flex items-center justify-between">
        <button
          className="flex items-center gap-1.5 text-left"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="font-semibold text-white/90">{character.name}</span>
          <span className="text-white/40 text-[10px]">{expanded ? '▲' : '▼'}</span>
        </button>
        <button
          onClick={onRemove}
          className="text-white/30 hover:text-red-400 text-[10px] px-1"
        >
          ✕
        </button>
      </div>

      {/* Expanded settings */}
      {expanded && (
        <div className="mt-2 flex flex-col gap-2">
          {/* Name */}
          <label className="flex flex-col gap-0.5">
            <span className="text-white/40 text-[10px] uppercase tracking-wider">Name</span>
            <input
              type="text"
              value={character.name}
              onChange={(e) => onChange({ ...character, name: e.target.value })}
              className="bg-white/5 rounded px-2 py-1 text-white/90 text-[12px] outline-none focus:bg-white/10"
            />
          </label>

          {/* Color */}
          <label className="flex items-center gap-2">
            <span className="text-white/40 text-[10px] uppercase tracking-wider">Color</span>
            <input
              type="color"
              value={character.color}
              onChange={(e) => onChange({ ...character, color: e.target.value })}
              className="w-6 h-6 rounded cursor-pointer bg-transparent border-0"
            />
          </label>

          {/* Reaction Chance */}
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

          {/* Reaction to Others */}
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

          {/* Temperature */}
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
              onChange={(e) =>
                onChange({ ...character, temperature: parseFloat(e.target.value) })
              }
              className="accent-white/60"
            />
          </label>

          {/* System Prompt */}
          <label className="flex flex-col gap-0.5">
            <span className="text-white/40 text-[10px] uppercase tracking-wider">System prompt</span>
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
```

**Step 2: Verify**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/src/components/CharacterCard.tsx
git commit -m "feat: CharacterCard component with expandable settings"
```

---

### Task 6: Settings drawer — SettingsDrawer component

**Files:**

- Create: `src/renderer/src/components/SettingsDrawer.tsx`

Slide-in drawer from the right, overlaying the comment feed. Shows the active roster with CharacterCards, an "Add from preset" dropdown, and an "Add custom" button.

**Step 1: Create the component**

```typescript
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
    systemPrompt: 'You are a witty commentator watching a conversation between a human and an AI. Keep responses to 1-2 sentences.',
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
}: SettingsDrawerProps) {
  const [draft, setDraft] = useState<CharacterConfig[]>(settings.activeCharacters)
  const [showPresetPicker, setShowPresetPicker] = useState(false)

  // Sync draft when settings change externally
  // (not needed for now since we're the only writer, but defensive)

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
              ✕
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
                onChange={(updated) => updateCharacter(i, updated)}
                onRemove={() => removeCharacter(i)}
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
                    <div className="absolute top-full left-0 right-0 mt-1 rounded-lg overflow-hidden z-10"
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

          {/* Footer — Save / Cancel */}
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
```

**Step 2: Verify**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/src/components/SettingsDrawer.tsx
git commit -m "feat: SettingsDrawer with character management"
```

---

### Task 7: Wire everything together in App.tsx

**Files:**

- Modify: `src/renderer/src/App.tsx`

**Step 1: Update App.tsx**

Replace the entire App.tsx with:

```typescript
import { useState } from 'react'
import { CommentList } from './components/CommentList'
import { SettingsDrawer } from './components/SettingsDrawer'
import { useComments } from './hooks/useComments'
import { useSettings } from './hooks/useSettings'

function App(): React.JSX.Element {
  const { comments } = useComments()
  const { settings, presets, isLoading, saveSettings } = useSettings()
  const [settingsOpen, setSettingsOpen] = useState(false)

  return (
    <div className="relative flex flex-col h-full">
      {/* Drag region + gear button */}
      <div
        className="h-6 shrink-0 flex items-center justify-between px-3"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className="w-5" />
        <div className="w-8 h-1 rounded-full bg-white/20" />
        <button
          onClick={() => setSettingsOpen(true)}
          className="text-white/30 hover:text-white/60 text-[13px] leading-none"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          ⚙
        </button>
      </div>

      {/* Comment feed */}
      <CommentList comments={comments} />

      {/* Empty state */}
      {comments.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="text-white/30 text-sm text-center px-8">
            Waiting for conversation to heckle...
          </p>
        </div>
      )}

      {/* Settings drawer */}
      {!isLoading && settings && (
        <SettingsDrawer
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          settings={settings}
          presets={presets}
          onSave={saveSettings}
        />
      )}
    </div>
  )
}

export default App
```

**Step 2: Verify**

Run: `npm run typecheck`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/src/App.tsx
git commit -m "feat: wire settings drawer into App with gear toggle"
```

---

### Task 8: Full verification

**Step 1: Typecheck**

Run: `npm run typecheck`
Expected: PASS

**Step 2: Manual test**

Run: `npm run dev` with Claude Desktop open.

Verify:

- Gear icon visible in top-right of drag bar
- Clicking gear opens settings drawer sliding in from right
- Active characters listed with colored borders
- Expanding a card shows name, color, sliders, system prompt
- Can remove a character and add it back from presets
- Can add a custom character
- Save persists — restart app and settings are retained
- Commentary still works with modified roster

**Step 3: Commit**

```bash
git add -A
git commit -m "feat: settings panel complete — character management with persistence"
```

---

## Key Files Summary

| File                                             | Action    | Purpose                                                 |
| ------------------------------------------------ | --------- | ------------------------------------------------------- |
| `package.json`                                   | Modify    | Add electron-store                                      |
| `src/shared/types.ts`                            | Modify    | AppSettings type, expanded PeanutGalleryAPI             |
| `src/preload/index.ts`                           | Modify    | getSettings, setSettings, getPresetCharacters IPC       |
| `src/preload/index.d.ts`                         | Unchanged | Already typed via PeanutGalleryAPI                      |
| `src/main/index.ts`                              | Modify    | electron-store setup, IPC handlers, dynamic engine init |
| `src/main/characters.ts`                         | Modify    | Accept dynamic character list, add setCharacters()      |
| `src/renderer/src/hooks/useSettings.ts`          | Create    | Settings state + save hook                              |
| `src/renderer/src/components/CharacterCard.tsx`  | Create    | Expandable character config card                        |
| `src/renderer/src/components/SettingsDrawer.tsx` | Create    | Slide-out drawer with roster management                 |
| `src/renderer/src/App.tsx`                       | Modify    | Gear button, drawer wiring                              |
