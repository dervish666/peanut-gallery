# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Peanut Gallery is a macOS Electron app that reads live conversations from chat apps (starting with Claude Desktop) via macOS Accessibility APIs, then generates running commentary from AI heckler characters (Waldorf & Statler / MST3K style). Commentary appears in a floating overlay panel beside the target app.

## Build & Development Commands

```bash
npm install                # Install dependencies (also runs build:swift via postinstall)
npm run dev                # Start Electron in dev mode with hot reload (electron-vite dev)
npm run build              # Production build (typecheck + electron-vite build)
npm run build:swift        # Compile Swift accessibility helper
npm run lint               # ESLint (eslint --cache .)
npm run typecheck          # TypeScript check (runs both typecheck:node and typecheck:web)
npm run build:mac          # Package macOS DMG via electron-builder
```

The Swift helper is compiled separately:
```bash
swiftc -framework Cocoa -framework ApplicationServices -o ax-reader src/native/ax-reader.swift
```

### Prerequisites
- Node.js 20+
- Xcode Command Line Tools (for Swift compilation)
- Anthropic API key via `ANTHROPIC_API_KEY` env var (checked via both `import.meta.env` and `process.env`)

## Architecture

Four main components, communicating via IPC and stdout/JSON:

```
Claude Desktop ──AX API──> Swift Helper ──stdout/JSON──> Message Differ ──> Character Engine ──> Overlay UI
```

### 1. Swift Helper (`src/native/ax-reader.swift`)
Compiled Swift CLI using macOS AXUIElement APIs. Runs as a child process of Electron. Accepts JSON commands on stdin (`list-apps`, `read-conversation`, `poll`, `stop`), emits newline-delimited JSON on stdout. Uses a `ConversationParser` protocol so new app parsers can be added. Currently targets Claude Desktop's Electron/Chromium accessibility tree via CSS class selectors (`!font-user-message`, `font-claude-response`, `overflow-y-scroll`, etc.).

### 2. Message Differ (`src/main/differ.ts`)
Compares successive accessibility snapshots to detect new messages. User messages emit immediately; assistant messages use a 2-second debounce/settling timer (only emits via `onMessageSettled` callback once text stops changing). Detects conversation switches via title changes. Skips settling on "Thinking..." messages — waits for the actual response to arrive.

### 3. Character Engine (`src/main/characters.ts`)
Manages AI personas (Waldorf, Statler, Dave). Calls Anthropic API (Claude Haiku) with character-specific system prompts. Characters are chained: A reacts to the conversation, B reacts to A's comment, C optionally reacts to both. Gate check (`reactionChance`) controls whether a message triggers commentary. 10-second minimum cooldown between rounds. Context limited to last 8 messages, responses capped at ~150 tokens. Also provides `roastTitle(rawTitle)` — generates a one-liner roast of the conversation title (fired immediately on conversation switch).

### 4. Overlay UI (`src/renderer/`)
React 18 + TypeScript + Tailwind CSS v4 + Framer Motion. Frameless, always-on-top, transparent Electron BrowserWindow with macOS vibrancy. Positioned at right edge of screen. Speech bubbles alternate left/right per character. Settings stored via electron-store. Theatre-themed frame with curtain SVG assets.

### 5. Main Process Orchestration (`src/main/index.ts`)
Ties everything together. Polls Claude Desktop every 3s via the Swift bridge. On conversation switch: emits `NowShowingEvent` with `roast: null` (banner appears immediately), then fires `roastTitle()` async and emits again with the roast string when ready. The differ's `onMessageSettled` callback triggers commentary generation. Window uses `hide()`/`show()` instead of `minimize()` since it's a frameless always-on-top overlay.

## Project Structure

- `src/native/` — Swift accessibility helper
- `src/main/` — Electron main process (swift-bridge, differ, characters, IPC handlers)
- `src/characters/` — Character configs and system prompts (individual modules per character)
- `src/preload/` — Electron preload script (context isolation bridge)
- `src/renderer/` — React UI (components, hooks, styles, assets)
- `src/shared/` — Shared TypeScript types (`types.ts` defines all IPC event shapes)
- `scripts/` — Build scripts (e.g., `build-swift.sh`)

## Key Technical Details

- **IPC channels (main→renderer)**: `comment:new`, `now-showing:update`, `status:update`
- **IPC channels (renderer→main)**: `settings:get`, `settings:set`, `characters:get-presets` (invoke); `window:minimize` (send)
- **Accessibility tree navigation**: Don't traverse the full tree. Navigate directly: Window → AXWebArea[1] (non-empty title) → `#main-content` → `.overflow-y-scroll` → message groups
- **User messages**: identified by `!font-user-message` class; text in `whitespace-pre-wrap break-words` groups
- **Assistant messages**: identified by `font-claude-response` class; displayed response in `row-start-2 col-start-1` section, skip thinking/reasoning sections
- **Streaming detection**: debounce (2s of no text change) or detect "Done" in thinking section footer (`text-text-300 !font-base`)
- **API model**: `claude-haiku-4-5-20251001` — fast/cheap for one-liner commentary
- **Now Showing banner**: two-phase display — raw title appears immediately on conversation switch with pulsing dots, roast reveals with "Otherwise Known As" transition, auto-dismisses 3.5s after roast arrives
- **Accessibility permissions**: check `AXIsProcessTrusted()` on startup; guide user to System Settings if denied
