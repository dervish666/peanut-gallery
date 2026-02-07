# Peanut Gallery — Implementation Plan

## Overview

**Peanut Gallery** is a standalone Electron app that reads live conversations from chat applications (starting with Claude Desktop) via macOS Accessibility APIs, then generates running commentary from a cast of AI heckler characters (Waldorf & Statler / MST3K style). The commentary appears in a floating overlay panel alongside the target application.

The user continues using their normal chat app. Peanut Gallery passively reads new messages, feeds them to cheap/fast AI character agents, and displays their reactions in real time.

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────────┐
│   Claude Desktop    │     │       Peanut Gallery          │
│   (or Slack, etc)   │     │       (Electron App)          │
│                     │     │                               │
│  ┌───────────────┐  │     │  ┌─────────────────────────┐  │
│  │ Conversation  │◄─┼─AX──┼─►│  Swift Helper Process   │  │
│  │ Messages      │  │ API │  │  (polls accessibility   │  │
│  └───────────────┘  │     │  │   tree, emits JSON)     │  │
│                     │     │  └───────────┬─────────────┘  │
└─────────────────────┘     │              │ stdout/JSON    │
                            │  ┌───────────▼─────────────┐  │
                            │  │  Message Differ          │  │
                            │  │  (detects new messages)  │  │
                            │  └───────────┬─────────────┘  │
                            │              │                │
                            │  ┌───────────▼─────────────┐  │
                            │  │  Character Engine        │  │
                            │  │  (Anthropic API calls    │  │
                            │  │   to Haiku with persona  │  │
                            │  │   system prompts)        │  │
                            │  └───────────┬─────────────┘  │
                            │              │                │
                            │  ┌───────────▼─────────────┐  │
                            │  │  Overlay UI              │  │
                            │  │  (character avatars +    │  │
                            │  │   speech bubbles)        │  │
                            │  └─────────────────────────┘  │
                            └──────────────────────────────┘
```

### Key Components

1. **Swift Helper** — A compiled Swift CLI that uses macOS AXUIElement APIs to read the accessibility tree of a target app. Runs as a child process, communicating via JSON over stdout.
2. **Message Differ** — Node.js module that compares successive accessibility snapshots to detect new user/assistant messages.
3. **Character Engine** — Manages 2-3 AI personas. Calls the Anthropic API (Claude Haiku) with character-specific system prompts. Chains responses so characters can react to each other.
4. **Overlay UI** — Electron BrowserWindow rendered as a floating panel with character avatars and speech bubbles. Always-on-top, semi-transparent, positioned beside the target app.

---

## Component 1: Swift Helper (`src/native/ax-reader.swift`)

### Purpose
Read the accessibility tree of a target application and extract conversation messages as structured JSON.

### Compilation
```bash
swiftc -framework Cocoa -framework ApplicationServices -o ax-reader src/native/ax-reader.swift
```

### Interface

The Swift helper accepts commands on stdin and responds on stdout with newline-delimited JSON.

**Commands (stdin, JSON):**

```json
{"command": "list-apps"}
```
Returns running apps that likely contain chat content.

```json
{"command": "read-conversation", "pid": 70284}
```
Reads the current conversation from the app with the given PID.

```json
{"command": "poll", "pid": 70284, "interval_ms": 3000}
```
Continuously polls and emits conversation snapshots at the given interval.

```json
{"command": "stop"}
```
Stops polling.

**Output (stdout, newline-delimited JSON):**

```json
{
  "type": "conversation",
  "app": "Claude",
  "pid": 70284,
  "title": "Enabling multiagent mode in Claude Code",
  "messages": [
    {
      "role": "user",
      "text": "How do I turn the new multiagent thingy on?",
      "timestamp": "17:36",
      "index": 0
    },
    {
      "role": "assistant",
      "text": "You just need to set one environment variable...",
      "timestamp": null,
      "index": 1
    }
  ]
}
```

### Accessibility Tree Parsing — Claude Desktop

The following parsing rules are derived from direct inspection of Claude Desktop's (Electron) accessibility tree. Claude Desktop exposes a clean, CSS-class-annotated DOM via AXWebArea elements.

**Window structure:**
```
AXWindow "Claude"
  └─ AXGroup (main)
       └─ AXGroup
            └─ AXWebArea (title = conversation title)
                 └─ AXGroup.bg-bg-100 (root)
                      └─ AXGroup#main-content
                           └─ AXGroup (flex container)
                                └─ AXGroup.overflow-y-scroll (scrollable message area) ← TARGET
```

**Finding the message container:**
1. Find all `AXWebArea` elements under the main window
2. Select the one with a non-empty `AXTitle` (this is the conversation WebArea — index 1 typically; index 0 is a blank utility WebArea)
3. Navigate to the element with id `main-content` (via `AXDOMIdentifier`)
4. Find the child with class containing `overflow-y-scroll` — this is the scrollable message list
5. Its children are the message groups

**Identifying user messages:**
- Look for `AXGroup` elements where a descendant has CSS class containing `!font-user-message`
- The actual message text is in `AXStaticText` elements within a child group with class `whitespace-pre-wrap break-words`
- Concatenate all `AXStaticText.value` strings within that group

**Identifying assistant (Claude) messages:**
- Look for `AXGroup` elements where a descendant has CSS class containing `font-claude-response`
- The **displayed response** (not the thinking) is in the section with class containing `row-start-2 col-start-1`
- Within that, find groups with class `font-claude-response-body`
- Concatenate all `AXStaticText.value` strings within those groups
- **Important:** There may be multiple `font-claude-response-body` groups for paragraphs — concatenate them with newline separators
- **Skip** the thinking/reasoning sections (these are in collapsible areas *before* the `row-start-2` section)

**Identifying timestamps:**
- After each message, there's an `AXGroup` with `desc="Message actions"`
- Its first child group may contain an `AXStaticText` with a time value like `"17:36"` or `"20:01"`

**Identifying the conversation title:**
- The `AXWebArea`'s `AXTitle` attribute contains the conversation title with suffix ` - Claude`
- Strip the ` - Claude` suffix

**Code blocks within messages:**
- Code blocks appear as `AXGroup` elements with class containing `code-block__code`
- They contain multiple `AXStaticText` children (syntax-highlighted tokens)
- Concatenate all token values to reconstruct the code
- For heckling purposes, code content can be summarized or truncated (the hecklers don't need to read every line of code)

**Thinking/reasoning sections (SKIP for heckling):**
- Claude's thinking appears in collapsible sections with a button title describing the thought
- These are within `overflow-hidden` groups that come *before* the `row-start-2` main response section
- The thinking text is in `font-claude-response-body` groups within these sections
- For heckling purposes, SKIP these — only send the visible response to characters

### Future App Parsers

The Swift helper should be designed with a **parser protocol/interface** so new app parsers can be added:

```swift
protocol ConversationParser {
    static var bundleIdentifier: String { get }
    static var appName: String { get }
    func parseConversation(from webArea: AXUIElement) -> Conversation?
}
```

Initial implementation: `ClaudeDesktopParser`. Future: `SlackParser`, `TeamsParser`, `DiscordParser`, etc.

### Accessibility Permissions

On first launch, the app needs to request accessibility permissions. The Swift helper should:
1. Check `AXIsProcessTrusted()` on startup
2. If not trusted, emit a JSON error message: `{"type": "error", "code": "accessibility_denied", "message": "..."}`
3. The Electron app should then show a dialog guiding the user to System Settings → Privacy & Security → Accessibility, and offer to open that pane directly.

---

## Component 2: Message Differ (`src/main/differ.ts`)

### Purpose
Compare successive conversation snapshots and identify new messages.

### Logic

```typescript
interface Message {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string | null;
  index: number;
}

interface ConversationSnapshot {
  title: string;
  messages: Message[];
}

class MessageDiffer {
  private lastSnapshot: ConversationSnapshot | null = null;

  /**
   * Returns newly detected messages since the last snapshot.
   * Uses a combination of message count and content hashing to detect changes.
   */
  diff(current: ConversationSnapshot): Message[] {
    if (!this.lastSnapshot) {
      this.lastSnapshot = current;
      // On first read, return the last 2-3 messages as initial context
      return current.messages.slice(-3);
    }

    // Detect new messages (appended to end)
    const newMessages: Message[] = [];
    const lastCount = this.lastSnapshot.messages.length;

    if (current.messages.length > lastCount) {
      // New messages appended
      newMessages.push(...current.messages.slice(lastCount));
    } else if (current.messages.length === lastCount) {
      // Check if the last message was updated (streaming completion)
      const lastCurrent = current.messages[current.messages.length - 1];
      const lastPrev = this.lastSnapshot.messages[this.lastSnapshot.messages.length - 1];
      if (lastCurrent && lastPrev && lastCurrent.text !== lastPrev.text) {
        // Message was updated (likely streaming) — only emit when "settled"
        // Use a debounce mechanism in the caller
      }
    } else {
      // Message count decreased — conversation was reset/changed
      // Treat as a fresh conversation
      newMessages.push(...current.messages.slice(-3));
    }

    // Detect conversation change (different title)
    if (current.title !== this.lastSnapshot.title) {
      this.lastSnapshot = current;
      return current.messages.slice(-3);
    }

    this.lastSnapshot = current;
    return newMessages;
  }
}
```

### Debounce for Streaming

Claude Desktop streams responses. The accessibility tree will show partial responses during streaming. To avoid heckling half-finished messages:

1. When a new assistant message is detected, start a **settling timer** (e.g., 2 seconds)
2. Each time the message text changes, reset the timer
3. Only emit the message to the Character Engine when the timer fires (text hasn't changed for 2 seconds)
4. This naturally waits for streaming to complete before heckling

---

## Component 3: Character Engine (`src/main/characters.ts`)

### Purpose
Manage AI character personas, generate commentary via the Anthropic API, and chain character interactions.

### Configuration

```typescript
interface CharacterConfig {
  id: string;
  name: string;
  avatarPath: string;         // Path to avatar image
  color: string;              // Theme color for speech bubbles
  systemPrompt: string;       // Full system prompt defining persona
  temperature: number;        // Usually 0.8-1.0 for creative/funny output
  maxTokens: number;          // Keep short — 100-200 tokens per comment
  reactionChance: number;     // 0-1, probability of reacting to a given message
  reactionToOtherChance: number; // 0-1, probability of reacting to another character
}
```

### Character Definitions

Characters will be defined in `src/characters/` as individual modules exporting a `CharacterConfig`. The system prompts will be loaded from separate text files for easy editing.

**Placeholder characters (to be refined — see separate character design):**

1. **Waldorf** — The sardonic critic. Finds fault with everything. Delivers withering one-liners.
2. **Statler** — Waldorf's partner. Builds on Waldorf's comments, escalates the joke, delivers punchlines.
3. **Gerald** — The bewildered newcomer. Doesn't understand technology. Asks confused questions. Accidentally profound.

### Commentary Generation Flow

```
New message detected
       │
       ▼
┌──────────────┐     Does this message warrant commentary?
│  Gate Check   │──── (random chance + heuristics: length, topic change, etc.)
│              │     If no → skip, wait for next message
└──────┬───────┘
       │ yes
       ▼
┌──────────────┐
│  Character A  │──── Send last N messages + new message to Character A (Haiku)
│  (Waldorf)    │     System prompt: character persona
└──────┬───────┘     User prompt: recent conversation context + "React to this"
       │
       │ Character A response
       ▼
┌──────────────┐
│  Character B  │──── Send same context + Character A's response to Character B
│  (Statler)    │     "Your partner just said: [A's comment]. React."
└──────┬───────┘
       │
       │ Character B response
       ▼
┌──────────────┐
│  Character C  │──── (Optional, lower probability)
│  (Gerald)     │     Send context + both previous comments
└──────┬───────┘     "You overheard: [A] and [B]. You're confused. React."
       │
       ▼
  Emit all comments to UI
```

### API Calls

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY  // or loaded from app settings
});

async function generateComment(
  character: CharacterConfig,
  conversationContext: Message[],
  previousComments: { character: string; text: string }[]
): Promise<string> {
  const contextText = conversationContext
    .map(m => `[${m.role}]: ${m.text.substring(0, 500)}`)
    .join('\n');

  const previousText = previousComments
    .map(c => `${c.character}: "${c.text}"`)
    .join('\n');

  let userPrompt = `Here's the recent conversation you're watching:\n\n${contextText}`;
  if (previousText) {
    userPrompt += `\n\nYour fellow hecklers just said:\n${previousText}`;
  }
  userPrompt += '\n\nYour reaction (keep it to 1-2 sentences max):';

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: character.maxTokens,
    temperature: character.temperature,
    system: character.systemPrompt,
    messages: [{ role: 'user', content: userPrompt }]
  });

  return response.content[0].type === 'text' ? response.content[0].text : '';
}
```

### Rate Limiting & Cost Control

- **Gate check**: Not every message gets heckled. Use `reactionChance` (e.g., 0.7 for 70% of messages).
- **Cooldown**: Minimum 10 seconds between commentary rounds to avoid spam.
- **Context window**: Only send the last 5-8 messages as context (not the full conversation).
- **Token limits**: Cap character responses at 150 tokens. Heckles should be snappy.
- **Model**: Use `claude-haiku-4-5-20251001` — fast, cheap, more than good enough for one-liners.
- **Estimated cost**: ~$0.001 per comment round (3 characters). Even at 20 rounds/hour, that's ~$0.02/hour.

---

## Component 4: Overlay UI (`src/renderer/`)

### Window Configuration

```typescript
// Main process — create overlay window
const overlay = new BrowserWindow({
  width: 380,
  height: 600,
  alwaysOnTop: true,
  frame: false,              // Frameless for custom title bar
  transparent: true,         // Allow rounded corners / transparency
  resizable: true,
  hasShadow: true,
  vibrancy: 'under-window',  // macOS frosted glass effect
  webPreferences: {
    preload: path.join(__dirname, 'preload.js'),
    contextIsolation: true,
    nodeIntegration: false
  }
});

// Position to the right of the target app window
// Use the target app's AXPosition and AXSize to calculate
overlay.setPosition(targetX + targetWidth + 10, targetY);
```

### UI Layout (React + Tailwind)

```
┌─────────────────────────────┐
│  🎭 Peanut Gallery     ─ □ │  ← Draggable title bar
├─────────────────────────────┤
│  Watching: "Multiagent..."  │  ← Current conversation title
│  Claude Desktop (PID 70284) │
├─────────────────────────────┤
│                             │
│  ┌─────┐ ┌───────────────┐  │
│  │ 👴  │ │ "Oh wonderful, │  │  ← Waldorf's comment
│  │     │ │  another env   │  │
│  │     │ │  variable!"    │  │
│  └─────┘ └───────────────┘  │
│                             │
│  ┌───────────────┐ ┌─────┐  │
│  │ "At least     │ │ 👴  │  │  ← Statler's comment (right-aligned)
│  │  this one     │ │     │  │
│  │  works!"      │ │     │  │
│  └───────────────┘ └─────┘  │
│                             │
│  ┌─────┐ ┌───────────────┐  │
│  │ 🤷  │ │ "What's an    │  │  ← Gerald's comment
│  │     │ │  environment?" │  │
│  └─────┘ └───────────────┘  │
│                             │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │  ← Separator between rounds
│                             │
│  (previous round...)        │
│                             │
├─────────────────────────────┤
│  ⚙ Settings    ⏸ Pause     │  ← Footer controls
└─────────────────────────────┘
```

### UI Technology

- **Framework**: React 18 with TypeScript
- **Styling**: Tailwind CSS
- **Build**: Vite (for fast HMR during development)
- **Animations**: Framer Motion (for comment entrance animations)
- **Character avatars**: Static PNG/SVG images, stored in `src/renderer/assets/avatars/`

### Comment Display

Each comment should animate in with a slide + fade effect. Comments scroll within the panel, with newest at the bottom. Old commentary rounds can collapse or fade to reduce clutter.

Speech bubbles should have the character's theme color as a subtle background tint. Alternate left/right alignment per character for visual variety.

### Settings Panel

Accessible via the gear icon. Stored in electron-store or a JSON file.

Settings:
- **API Key**: Anthropic API key input (stored securely in system keychain via `safeStorage`)
- **Target App**: Dropdown to select which app to watch (populated by `list-apps` command)
- **Character Toggles**: Enable/disable individual characters
- **Reaction Frequency**: Slider (0-100%) controlling how often characters react
- **Commentary Style**: Dropdown — "Heckling" / "Supportive" / "Confused" (adjusts system prompts)
- **Cooldown**: Slider for minimum seconds between commentary rounds
- **Overlay Opacity**: Slider

---

## Project Structure

```
peanut-gallery/
├── package.json
├── tsconfig.json
├── electron-builder.yml        # Packaging config
├── vite.config.ts              # Vite config for renderer
├── src/
│   ├── native/
│   │   └── ax-reader.swift     # Swift accessibility helper
│   ├── main/
│   │   ├── index.ts            # Electron main process entry
│   │   ├── swift-bridge.ts     # Spawns & communicates with Swift helper
│   │   ├── differ.ts           # Message diffing logic
│   │   ├── characters.ts       # Character engine & API calls
│   │   ├── settings.ts         # Settings management (electron-store)
│   │   └── ipc-handlers.ts     # IPC handlers for renderer communication
│   ├── characters/
│   │   ├── index.ts            # Character registry
│   │   ├── waldorf.ts          # Waldorf config + system prompt
│   │   ├── statler.ts          # Statler config + system prompt
│   │   └── gerald.ts           # Gerald config + system prompt
│   ├── preload/
│   │   └── index.ts            # Preload script exposing IPC to renderer
│   ├── renderer/
│   │   ├── index.html
│   │   ├── App.tsx             # Root React component
│   │   ├── main.tsx            # React entry point
│   │   ├── components/
│   │   │   ├── TitleBar.tsx    # Custom draggable title bar
│   │   │   ├── StatusBar.tsx   # Shows what app/conversation is being watched
│   │   │   ├── CommentFeed.tsx # Scrolling list of character comments
│   │   │   ├── CommentBubble.tsx  # Individual speech bubble
│   │   │   ├── CharacterAvatar.tsx # Avatar display
│   │   │   ├── SettingsPanel.tsx   # Settings modal/drawer
│   │   │   └── Footer.tsx      # Pause/settings controls
│   │   ├── hooks/
│   │   │   ├── useComments.ts  # Hook for comment state management
│   │   │   └── useSettings.ts  # Hook for settings
│   │   ├── styles/
│   │   │   └── globals.css     # Tailwind imports + custom styles
│   │   └── assets/
│   │       └── avatars/        # Character avatar images
│   │           ├── waldorf.png
│   │           ├── statler.png
│   │           └── gerald.png
│   └── shared/
│       └── types.ts            # Shared TypeScript types
├── scripts/
│   └── build-swift.sh          # Compile Swift helper
└── resources/
    └── icon.png                # App icon
```

---

## IPC Communication

### Main → Renderer (via IPC)

```typescript
// New comment from a character
ipcMain.emit('comment:new', {
  id: string,
  characterId: string,
  characterName: string,
  text: string,
  roundId: string,           // Groups comments from the same trigger
  timestamp: number
});

// Status updates
ipcMain.emit('status:update', {
  watching: boolean,
  appName: string,
  conversationTitle: string,
  pid: number
});

// Error messages
ipcMain.emit('error', {
  code: string,
  message: string
});
```

### Renderer → Main (via IPC)

```typescript
// Control commands
ipcRenderer.invoke('control:pause');
ipcRenderer.invoke('control:resume');
ipcRenderer.invoke('control:select-app', pid: number);

// Settings
ipcRenderer.invoke('settings:get');
ipcRenderer.invoke('settings:set', key: string, value: any);
```

---

## Build & Development

### Prerequisites
- Node.js 20+
- Xcode Command Line Tools (for Swift compilation)
- Anthropic API key

### Setup
```bash
npm install
npm run build:swift    # Compile the Swift helper
npm run dev            # Start Electron in dev mode with hot reload
```

### Package.json Scripts
```json
{
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "build:swift": "bash scripts/build-swift.sh",
    "postinstall": "npm run build:swift",
    "package": "electron-builder",
    "lint": "eslint src/",
    "typecheck": "tsc --noEmit"
  }
}
```

### Key Dependencies
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "latest",
    "electron-store": "latest",
    "framer-motion": "latest",
    "react": "^18",
    "react-dom": "^18"
  },
  "devDependencies": {
    "@electron-toolkit/preload": "latest",
    "@electron-toolkit/utils": "latest",
    "autoprefixer": "latest",
    "electron": "latest",
    "electron-builder": "latest",
    "electron-vite": "latest",
    "postcss": "latest",
    "tailwindcss": "latest",
    "typescript": "latest",
    "@types/react": "latest",
    "@types/react-dom": "latest"
  }
}
```

---

## Implementation Order

### Phase 1: Foundation (Do First)
1. Initialize project with `electron-vite` template (React + TypeScript)
2. Set up Tailwind CSS
3. Write and compile the Swift accessibility helper (`ax-reader.swift`)
4. Implement `swift-bridge.ts` to spawn and communicate with the Swift helper
5. Test: Can we read messages from Claude Desktop? Log them to console.

### Phase 2: Core Logic
6. Implement `differ.ts` with debounce for streaming messages
7. Implement `characters.ts` with the Character Engine
8. Create placeholder character configs with basic system prompts (will be refined later)
9. Wire up: poll → diff → generate → log comments to console
10. Test end-to-end: Have a conversation in Claude Desktop, see heckler comments in the Electron console

### Phase 3: UI
11. Build the overlay window (frameless, always-on-top, transparent)
12. Implement `TitleBar.tsx` with drag support
13. Implement `CommentFeed.tsx` and `CommentBubble.tsx`
14. Implement `StatusBar.tsx` showing watched app/conversation
15. Implement `Footer.tsx` with pause/resume controls
16. Add Framer Motion animations for comment entrance
17. Create placeholder avatar images (simple colored circles with initials until real avatars are provided)

### Phase 4: Settings & Polish
18. Implement settings panel with API key input (stored via safeStorage)
19. Add app selection dropdown
20. Add character enable/disable toggles
21. Add reaction frequency and cooldown controls
22. Handle accessibility permission flow (detection + user guidance dialog)
23. Add system tray icon for quick access
24. Handle edge cases: app closed, conversation changed, network errors, API errors

### Phase 5: Packaging
25. Configure electron-builder for macOS DMG distribution
26. Add app icon
27. Code signing (if available)
28. Test packaged app

---

## Important Notes for Implementation

### Accessibility API Gotchas
- The accessibility tree is read-only. We cannot modify the target app.
- The AXUIElement API requires the process to have accessibility permissions granted by the user.
- The tree can be large. Don't traverse deeper than necessary — go straight to known structural paths.
- `AXDOMIdentifier` maps to HTML `id` attributes. `AXDOMClassList` maps to CSS class lists. These are available because Claude Desktop is Electron (Chromium).
- Element positions and the tree structure may change with Claude Desktop updates. The parser should fail gracefully and log diagnostic info if the expected structure isn't found.

### Streaming Detection
- Claude Desktop streams responses. During streaming, the last assistant message in the tree will grow over time.
- Use the debounce approach: only process a message when its text hasn't changed for 2+ seconds.
- Alternative: detect the "Done" text that appears in the thinking section's footer (class `text-text-300 !font-base`, value "Done"). This indicates the response is complete.

### Conversation Changes
- When the user switches conversations, the WebArea title changes and the message list is replaced.
- The differ should detect this via title change and reset its state.

### Security
- The API key should be stored using Electron's `safeStorage` API, not in plaintext.
- The Swift helper only reads accessibility data. It cannot modify other apps or send keystrokes.

### Performance
- Polling interval of 3 seconds is fine. The accessibility API calls are fast (< 100ms for the targeted traversal).
- Don't traverse the full tree. Navigate directly to the known structural path: Window → WebArea[1] → #main-content → .overflow-y-scroll → messages.
- The Character Engine API calls are async and don't block the UI.

---

## Character System Prompts

Character system prompts will be provided separately and placed in the `src/characters/` directory. For initial development, use these **placeholder prompts**:

### Waldorf (placeholder)
```
You are Waldorf, a grumpy old theatre critic watching a conversation between a human and an AI assistant. You find everything about it vaguely irritating and beneath you. Make short, sardonic comments (1-2 sentences max). Be witty, not mean-spirited. Reference the actual content of the conversation in your heckles.
```

### Statler (placeholder)
```
You are Statler, a grumpy old theatre critic and Waldorf's best friend. You watch conversations between humans and AI assistants. When you see what your partner Waldorf said, build on his joke or deliver a punchline. When reacting alone, make dry observations. Keep it to 1-2 sentences. You think AI is simultaneously impressive and ridiculous.
```

### Gerald (placeholder)
```
You are Gerald, a bewildered retiree who doesn't understand technology. You somehow ended up watching a conversation between a human and an AI. You're confused by everything but trying your best to follow along. Make short, confused comments (1-2 sentences). Occasionally stumble into accidentally profound observations. You think "the cloud" is an actual cloud.
```

These will be replaced with carefully crafted prompts — treat them as temporary.

---

## Testing

- **Swift helper**: Test with a mock accessibility tree or against a running Claude Desktop instance.
- **Differ**: Unit tests with mock conversation snapshots (known sequences of messages, streaming simulation, conversation switches).
- **Character Engine**: Unit tests with mocked Anthropic API responses. Integration test with real API (low cost with Haiku).
- **UI**: Visual testing during development. Storybook optional but not required for MVP.
- **End-to-end**: Manual testing — open Claude Desktop, start a conversation, verify comments appear in the overlay.
