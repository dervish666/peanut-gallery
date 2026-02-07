# Phase 1: Foundation — Design

## Goal

Prove that Peanut Gallery can read live conversation messages from Claude Desktop via macOS Accessibility APIs. Success = parsed messages appear in the Electron dev console.

## Scope

Phase 1 only. No polling loop, no message differ, no character engine, no overlay UI changes.

## 1. Project Scaffolding

Use `npm create @electron-vite` with the React + TypeScript template to scaffold the project. This provides:

- `src/main/index.ts` — Electron main process entry
- `src/preload/index.ts` — Preload script with context isolation
- `src/renderer/` — React app with Vite HMR
- `electron.vite.config.ts` — Build config for all three targets
- `tsconfig` files for main/preload/renderer

After scaffolding:

- Add Tailwind CSS v4 to the renderer (needed later, trivial to add now)
- Create project-specific directories: `src/native/`, `src/characters/`, `src/shared/`, `scripts/`
- Add `build:swift` and `postinstall` scripts to `package.json`

## 2. Swift Accessibility Helper (`src/native/ax-reader.swift`)

Single-file Swift CLI compiled with `swiftc`. The core risk of the whole project.

### Interface

- Reads JSON commands from stdin (newline-delimited)
- Writes JSON responses to stdout (newline-delimited)

### Phase 1 Commands

Only two commands implemented:

- `list-apps` — returns running apps with accessibility trees, filtered to likely chat apps
- `read-conversation` — one-shot read of messages from a given PID

`poll` and `stop` deferred to Phase 2.

### Claude Desktop Parsing Strategy

Navigate the known structural path directly (no full tree traversal):

1. Get AXWindows for the target PID
2. Find AXWebArea with non-empty AXTitle (the conversation web area)
3. Drill to `#main-content` via AXDOMIdentifier
4. Find `.overflow-y-scroll` child via AXDOMClassList
5. Iterate message groups:
   - User messages: descendant has `!font-user-message` class, text in `whitespace-pre-wrap break-words` groups
   - Assistant messages: descendant has `font-claude-response` class, response in `row-start-2 col-start-1` section, skip thinking/reasoning sections
6. Extract text by concatenating AXStaticText values

### Architecture

Include the `ConversationParser` protocol from the start (zero cost, one protocol + one conforming struct). Only implement `ClaudeDesktopParser`.

### Error Handling

- `AXIsProcessTrusted()` returns false → emit `{"type": "error", "code": "accessibility_denied"}` and exit
- Expected tree structure not found → emit diagnostic error with what was found instead
- Target app not running → emit `{"type": "error", "code": "app_not_found"}`

### Compilation

`scripts/build-swift.sh`:
```bash
swiftc -framework Cocoa -framework ApplicationServices -O -o resources/ax-reader src/native/ax-reader.swift
```

Output goes to `resources/` so electron-builder can bundle it.

## 3. Swift Bridge (`src/main/swift-bridge.ts`)

TypeScript module managing the Swift helper as a child process.

### API Surface

```typescript
class SwiftBridge {
  async start(): Promise<void>
  async listApps(): Promise<App[]>
  async readConversation(pid: number): Promise<Conversation>
  destroy(): void
}
```

### Implementation

- Spawn `ax-reader` binary via `child_process.spawn`
- Send JSON commands by writing to child's stdin
- Parse responses via line-buffered reader on stdout (split on `\n`, parse each line as JSON)
- Each command returns a promise that resolves when the matching response arrives

### Error Propagation

- Swift helper emits `{"type": "error", ...}` → bridge rejects the pending promise with a typed error
- Process crashes/exits unexpectedly → all pending promises reject, bridge emits event for main process

### Binary Location

- Dev mode: resolve from `resources/ax-reader`
- Production (packaged): resolve from `process.resourcesPath`

## 4. Wiring Together

### `src/main/index.ts` Changes

On `app.ready`:

1. Instantiate `SwiftBridge`, call `start()`
2. Call `listApps()`, log results to console
3. If Claude Desktop found, call `readConversation(pid)`, log parsed messages
4. If accessibility denied, show native Electron dialog guiding user to System Settings

No other changes. Default electron-vite React app renders untouched.

## Manual Test Flow

1. Open Claude Desktop with an active conversation
2. Run `npm run dev`
3. Check Electron dev console for:
   - List of detected apps
   - Parsed conversation messages as JSON

## Done Criteria

- Swift helper compiles without errors
- `list-apps` returns Claude Desktop
- `read-conversation` returns structured messages with correct roles and text, thinking sections excluded
- Errors produce clear diagnostic output instead of crashes
