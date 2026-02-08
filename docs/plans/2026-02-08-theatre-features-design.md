# Theatre Features Design

Date: 2026-02-08

Five features that deepen the theatrical metaphor: a curtain opening, now-showing marquee, intermission screen, character avatars, and a programme-styled settings page.

---

## Feature 1: "Now Showing" Marquee Banner

### Overview
Non-blocking banner that slides down from behind the valance into the top of the stage area when a conversation is detected. Comments continue to render below it.

### Triggers
- First message detection after startup (after curtain animation if played)
- Conversation switch (detected via AX tree title change in the differ)

### Behaviour
- Shows the conversation title from the AX tree immediately — no API call needed
- After 2-3 messages have been processed, fires a background Haiku call to generate a theatrical title (max 8 words, ~200 tokens)
- If the AI title returns before the banner auto-dismisses, swap it in
- If the banner has already gone, slide it back down briefly with the new name
- Auto-dismiss after 4 seconds, or click to dismiss early
- Comments render normally below the banner during display

### Layout
```
+--- Valance ------------------------------------+
|  NOW SHOWING                                    |  <- slides down from behind valance
|  "Debugging a Python Script..."                 |
|  Featuring WALDORF & STATLER                    |
+-------------------------------------------------+
|                                                 |  <- comments render here normally
|  comment bubbles...                             |
|                                                 |
```

### Sizing
Compact — roughly 80-100px tall. Gold text on dark translucent background. Reads as a floating marquee over the stage.

### AI Title Prompt
```
Generate a dramatic, slightly absurd theatre play title (max 8 words)
for a conversation about: {first_message_preview}
```
Fires once per conversation, negligible cost.

### Title Extraction
```ts
function getConversationTitle(): string {
  // Primary: AX tree window/conversation title from Swift helper
  // Fallback: first human message truncated to ~60 chars
  // Last resort: "An Unscripted Performance"
}
```

### CSS
```css
.now-showing-banner {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 80-100px;
  background: rgba(26, 26, 26, 0.9);
  z-index: 10;
  text-align: center;
  transform: translateY(-100%);
  transition: transform 0.5s ease-out;
  font-family: 'Playfair Display', Georgia, serif;
}

.now-showing-banner.visible {
  transform: translateY(0);
}

.now-showing-label {
  font-size: 14px;
  color: #DAA520;
  letter-spacing: 6px;
  text-transform: uppercase;
}

.now-showing-title {
  font-size: 20px;
  color: #F5F0E8;
  font-style: italic;
}

.now-showing-cast {
  font-size: 13px;
  color: #888;
}

.now-showing-names {
  color: #DAA520;
  letter-spacing: 3px;
}
```

### Pre-work
Verify that conversation title is accessible from the AX tree and that conversation switch detection fires reliably in the differ.

---

## Feature 2: Intermission Screen

### Overview
When the app goes idle, a crossfade replaces the comment list with a themed intermission card. No curtain involvement — just a simple transition within the stage area.

### Triggers
- No new messages for X minutes (default: 5, configurable in settings)
- User manually pauses via UI
- Claude Desktop window closed or not found
- Loss of accessibility permissions

Each trigger has its own subtitle text so the user knows why heckling stopped.

### Layout
```
+--- Theatre Frame (curtains still visible) ------+
|                                                  |
|              --- INTERMISSION ---                |
|                                                  |
|            The performers are resting.           |
|                                                  |
|                                                  |
|            Last quip: 3 minutes ago              |
|            Total zingers this session: 24        |
|                                                  |
+--------------------------------------------------+
```

### Visual Style
- Warm radial gradient background — slightly brighter than normal stage ("house lights up")
- "INTERMISSION" in gold Playfair Display, centred, large letter-spacing
- Gold decorative dividers above and below
- Session stats in muted grey
- Crossfade transition (0.5s) in both directions

### Subtitle Text by Trigger
- `idle` — "The performers are resting."
- `paused` — "The show has been paused."
- `disconnected` — "The stage is empty."
- `permissions` — "Stage access denied."

### Resume Behaviour
- Auto-resumes when new messages detected (idle timeout and app-not-found cases)
- Manual un-pause required for user-paused state
- Crossfade back to comment list, no interstitial
- Resets idle timer on resume

### State Management
Idle timer runs in main process alongside the polling loop (it already knows when messages last changed). Main process sends `status:intermission` IPC event to renderer with the reason. Renderer handles the crossfade.

```ts
interface IntermissionConfig {
  idleTimeoutMs: number;      // Default: 5 * 60 * 1000
  showStats: boolean;         // Show session stats during intermission
  autoResume: boolean;        // Auto-dismiss when new messages detected
}
```

### CSS
```css
.intermission {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  background: radial-gradient(ellipse at center, #3D2D2D 0%, #1A1A1A 70%);
}

.intermission-title {
  font-family: 'Playfair Display', serif;
  font-size: 32px;
  color: #DAA520;
  letter-spacing: 8px;
  text-transform: uppercase;
}

.intermission-divider {
  color: #B8860B;
  font-size: 14px;
  letter-spacing: 4px;
  margin: 10px 0;
}

.intermission-subtitle {
  color: #A0A0A0;
  font-style: italic;
}

.intermission-stats {
  color: #888;
  font-size: 13px;
  line-height: 1.8;
}
```

---

## Feature 3: Curtain Opening Animation

### Overview
One-time startup spectacle. A `CurtainOverlay` component renders on top of the existing TheatreFrame as an absolutely positioned layer. The TheatreFrame renders normally underneath from the start and is untouched by this feature.

### Architecture
- Overlay sits inside the TheatreFrame's container with `overflow: hidden`
- Two full-panel curtain SVGs (left and right) cover the stage area
- "Peanut Gallery" title centred in gold theatrical script on the closed curtains
- Curtains roll upward (translateY to negative), disappearing behind the top border/valance — like being hoisted into the rigging
- Overlay unmounts completely after animation finishes (no residual DOM)

### Animation Sequence
```
0.0s - Overlay visible, curtains closed, "Peanut Gallery" title displayed
0.5s - Curtains begin rolling upward (translateY)
2.0s - Curtains fully hidden behind valance
2.0s - Overlay unmounts, normal stage visible
```

### State Machine
```tsx
type CurtainState = 'closed' | 'opening' | 'done';

const CurtainOverlay = ({ onComplete }) => {
  const [state, setState] = useState<CurtainState>('closed');

  useEffect(() => {
    const t1 = setTimeout(() => setState('opening'), 500);
    const t2 = setTimeout(() => {
      setState('done');
      onComplete();
    }, 2000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  if (state === 'done') return null;

  return (
    <div className={`curtain-overlay curtain-${state}`}>
      <img src={curtainLeftSvg} className="curtain-panel-left" />
      <img src={curtainRightSvg} className="curtain-panel-right" />
      <div className="curtain-title">Peanut Gallery</div>
    </div>
  );
};
```

### Replay Control
- `hasSeenOpening` stored in `sessionStorage` — cold starts replay, dev reloads don't
- Optional toggle in settings (Production Notes section): "Play opening animation"

### CSS
```css
.curtain-overlay {
  position: absolute;
  inset: 0;
  z-index: 50;
  overflow: hidden;
  pointer-events: none;
}

.curtain-panel-left,
.curtain-panel-right {
  position: absolute;
  top: 0;
  width: 50%;
  height: 100%;
  transition: transform 1.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}

.curtain-panel-left { left: 0; }
.curtain-panel-right { right: 0; }

.curtain-opening .curtain-panel-left,
.curtain-opening .curtain-panel-right {
  transform: translateY(-100%);
}

.curtain-title {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: 'Playfair Display', serif;
  font-size: 36px;
  color: #DAA520;
  letter-spacing: 4px;
  transition: opacity 0.5s;
}

.curtain-opening .curtain-title {
  opacity: 0;
}
```

### New Assets
- `curtain-full-left.svg` — full half-panel curtain with heavy draped folds
- `curtain-full-right.svg` — mirror of above

### What This Does NOT Change
- TheatreFrame component — untouched, no new states or conditional rendering
- Side drape SVGs — remain as they are
- Valance — remains as it is, acts as natural mask for the roll-up

---

## Feature 4: Character Profile Pictures

### Overview
Replace mic emojis with circular avatar portraits in comment bubbles. Ship with illustrated SVG defaults, allow custom image uploads via settings.

### Default Artwork
Silhouette style — not Muppet likenesses (copyright), but evocative theatre characters:
- **Waldorf**: grumpy old man silhouette, arms crossed, warm red/gold tones
- **Statler**: gleeful old man silhouette, leaning forward, purple/gold tones
- **Custom characters**: generic comedy/tragedy theatre mask as fallback

All defaults are bundled SVGs that work at small sizes (44px rendered).

### Avatar Component
```tsx
const CharacterAvatar = ({ character }: { character: CharacterConfig }) => {
  const avatarSrc = character.avatarFile
    ? `file://${getAvatarPath(character.avatarFile)}`
    : character.defaultAvatar; // bundled SVG import

  return (
    <img
      src={avatarSrc}
      className="avatar-circle"
      style={{ borderColor: character.colour }}
      alt={character.name}
    />
  );
};
```

### CSS
```css
.avatar-circle {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 2px solid #DAA520;
  box-shadow: 0 0 6px rgba(218, 165, 32, 0.3);
  object-fit: cover;
}
```

### Custom Image Upload
- Electron `dialog.showOpenDialog` filtered to PNG, JPG, SVG
- Resize to 128x128 max using canvas API (no `sharp` dependency)
- Save to `app.getPath('userData')/avatars/{characterId}.png`
- Store only the filename in electron-store: `{ avatarFile: "waldorf.png" }`
- "Reset to Default" deletes the file and clears the store field
- Deleting a character cleans up its avatar file

### Settings UI Addition
Added to existing character card, not a separate page:
```
[Current avatar preview]  [Upload Image]  [Reset to Default]
```

### Character Config Extension
```ts
interface CharacterConfig {
  id: string;
  name: string;
  defaultAvatar: string;   // bundled SVG path
  avatarFile?: string;      // user-uploaded filename in avatars dir
  // ... existing fields
}
```

### File Paths
```
~/Library/Application Support/PeanutGallery/avatars/waldorf.png
~/Library/Application Support/PeanutGallery/avatars/statler.png
```

---

## Feature 5: Settings as Theatre Programme

### Overview
Restyle the existing settings drawer as a vintage theatre playbill. Purely a CSS and layout job — underlying settings data and controls stay the same.

### Typography
Playfair Display, bundled locally as woff2 files (OFL license). Loaded via `@font-face` in CSS. Approximately 100KB added to app bundle.

### Colour Palette

| Element | Value | Usage |
|---------|-------|-------|
| Background | `#F5F0E8` | Cream parchment with SVG noise texture |
| Text | `#3D2B1F` | Dark brown, all body copy |
| Headings | `#8B1A1A` | Deep red, section titles |
| Borders | `#B8860B` | Gold, decorative borders |
| Accents | `#DAA520` | Gold, controls and highlights |

### Section Mapping
Existing settings restructured into programme sections:

1. **Header** — "Programme" title, "Peanut Gallery — An Evening of Unsolicited Commentary", decorative gold border
2. **The Cast** — Existing character cards with avatar preview, name, role label (e.g. "Lead Critic"), colour picker, reaction chance slider
3. **Production Notes** — Model selection, polling interval, context depth, "Play opening animation" toggle, idle timeout
4. **Management** — Add new cast member, reset to defaults

### Transition
Settings panel slides up from below — like picking up a programme from your lap. Same drawer mechanic as current, different entry direction.

### CSS
```css
.settings-programme {
  background: #F5F0E8;
  background-image: url('paper-texture.svg');
  color: #3D2B1F;
  font-family: 'Playfair Display', Georgia, serif;
  padding: 30px;
  border: 3px double #B8860B;
  margin: 10px;
}

.programme-title {
  text-align: center;
  font-size: 28px;
  text-transform: uppercase;
  letter-spacing: 4px;
  border-bottom: 2px solid #B8860B;
}

.programme-section h2 {
  font-size: 16px;
  text-transform: uppercase;
  letter-spacing: 3px;
  color: #8B1A1A;
}

.cast-role {
  font-style: italic;
  color: #8B6914;
}

input[type="range"] {
  accent-color: #DAA520;
}
```

### Paper Texture
Subtle SVG noise pattern tiled as background:
```svg
<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
  <filter id="noise">
    <feTurbulence baseFrequency="0.9" numOctaves="4" seed="1"/>
    <feColorMatrix type="saturate" values="0"/>
  </filter>
  <rect width="200" height="200" filter="url(#noise)" opacity="0.03"/>
</svg>
```

### Footer
*"No refunds." -- The Management*

### What This Does NOT Change
- Settings data model or storage
- Settings fields (except adding "Play opening animation" toggle)
- How settings are read/written via electron-store

---

## Build Order

| Order | Feature | Effort | Notes |
|-------|---------|--------|-------|
| 1 | Now Showing banner | Small | Bundle Playfair Display font here (reused by all later features). Verify AX title extraction and conversation switch detection. |
| 2 | Intermission screen | Small | Reuses Playfair Display and gold styling. Adds idle timer to main process. |
| 3 | Curtain opening | Medium | Separate overlay component. Needs 2 new curtain SVGs. |
| 4 | Profile pictures | Medium | File dialog, canvas resize, avatar file storage. Independent of other features. |
| 5 | Settings programme | Medium | CSS restyle. All dependencies (font, avatar component) already in place. |

Steps 4 and 5 are fully independent and can be done in parallel.

### Full Startup Sequence
```
0.0s  - Curtain overlay visible (if enabled/first run)
0.5s  - Curtains roll up
2.0s  - Curtains gone, overlay unmounts
2.0s  - Now Showing banner slides down (if conversation detected)
6.0s  - Banner auto-dismisses (or click to dismiss)
6.0s  - Heckling begins
```

If curtain animation is disabled/skipped, the Now Showing banner appears immediately on first message detection.

---

## Shared Assets & Dependencies

### Font
- Playfair Display (Regular 400, Bold 700, Italic 400)
- Bundled as woff2 in `src/renderer/src/assets/fonts/`
- Loaded via `@font-face` in global CSS
- OFL license, ~100KB total

### New SVGs
- `curtain-full-left.svg` — heavy draped curtain panel
- `curtain-full-right.svg` — mirror
- `paper-texture.svg` — subtle noise for programme background
- `avatar-waldorf.svg` — default silhouette portrait
- `avatar-statler.svg` — default silhouette portrait
- `avatar-default.svg` — comedy/tragedy mask fallback

### New IPC Channels
- `status:intermission` — main to renderer, carries reason string
- `avatar:upload` — renderer to main, triggers file dialog and save
- `avatar:reset` — renderer to main, deletes custom avatar file

### New Settings Fields
- `openingAnimation: boolean` — play curtain opening (default: true)
- `idleTimeoutMinutes: number` — intermission idle threshold (default: 5)
