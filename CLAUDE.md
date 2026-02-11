# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Codebase Structure Index

The file map below provides instant orientation. For detailed export signatures and dependencies, read the relevant `.claude/structure/*.yaml` file for the directory you're working in.

After adding, removing, or renaming source files or public classes/functions, update both the file map below and the relevant structure YAML file.

## Project Overview

Peanut Gallery is a macOS Electron app that reads live conversations from chat apps (starting with Claude Desktop) via macOS Accessibility APIs, then generates running commentary from AI heckler characters (Waldorf & Statler / MST3K style). Commentary appears in a floating overlay panel beside the target app.

## Build & Development Commands

```bash
npm install                # Install dependencies (also runs build:swift via postinstall)
npm run dev                # Start Electron in dev mode with hot reload (electron-vite dev)
npm run build              # Production build (typecheck + electron-vite build)
npm run build:swift        # Compile Swift accessibility helper
npm run lint               # ESLint (eslint --cache .)
npm run format             # Prettier (prettier --write .)
npm run typecheck          # TypeScript check (runs both typecheck:node and typecheck:web)
npm test                   # Run all tests (vitest run)
npm run test:watch         # Run tests in watch mode (vitest)
npm run build:mac          # Package macOS DMG via electron-builder
```

Run a single test file:
```bash
npx vitest run src/main/differ.test.ts
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
Compiled Swift CLI using macOS AXUIElement APIs. Runs as a child process of Electron. Accepts JSON commands on stdin (`list-apps`, `read-conversation`, `stop`), emits newline-delimited JSON on stdout. Also pushes unsolicited `app-activated` events via an `NSWorkspace.didActivateApplicationNotification` observer whenever any macOS app gains focus. Uses a RunLoop on the main thread with stdin reading on a background DispatchQueue. Uses a `ConversationParser` protocol so new app parsers can be added. Currently targets Claude Desktop's Electron/Chromium accessibility tree via CSS class selectors (`!font-user-message`, `font-claude-response`, `overflow-y-scroll`, etc.).

### 2. Message Differ (`src/main/differ.ts`)
Compares successive accessibility snapshots to detect new messages. User messages emit immediately; assistant messages use a 2-second debounce/settling timer (only emits via `onMessageSettled` callback once text stops changing). Detects conversation switches via title changes. Skips settling on "Thinking..." messages — waits for the actual response to arrive.

### 3. Character Engine (`src/main/characters.ts`)
Manages AI personas (Waldorf, Statler, Dave). Calls Anthropic API (Claude Haiku) with character-specific system prompts. Characters are chained: A reacts to the conversation, B reacts to A's comment, C optionally reacts to both. Gate check (`reactionChance`) controls whether a message triggers commentary. 10-second minimum cooldown between rounds. Context limited to last 8 messages, responses capped at ~150 tokens. Also provides `roastTitle(rawTitle)` — generates a one-liner roast of the conversation title (fired immediately on conversation switch).

### 4. Overlay UI (`src/renderer/`)
React 18 + TypeScript + Tailwind CSS v4 + Framer Motion. Frameless, always-on-top, transparent Electron BrowserWindow with macOS vibrancy. Positioned at right edge of screen. Speech bubbles alternate left/right per character. Settings stored via electron-store. Theatre-themed frame with curtain SVG assets.

### 5. Main Process Orchestration (`src/main/index.ts`)
Ties everything together. Hidden from Dock/Cmd+Tab via `app.dock.hide()`. Uses event-driven focus tracking: the Swift bridge pushes `app-activated` events, and the main process shows the overlay (floating + showInactive) when Claude Desktop activates, hides it when another app activates, and ignores self-activation (clicking the overlay). Polls Claude Desktop every 3s for conversation content. On conversation switch: emits `NowShowingEvent` with `roast: null` (banner appears immediately), then fires `roastTitle()` async and emits again with the roast string when ready. The differ's `onMessageSettled` callback triggers commentary generation.

## Project Structure

### File Map

<!-- One line per source file: relative path - brief description -->

# Main Process
src/main/index.ts - Electron entry; orchestrates polling, IPC, and overlay window management
src/main/swift-bridge.ts - SwiftBridge class manages ax-reader child process communication
src/main/differ.ts - MessageDiffer compares snapshots to detect new/streaming messages
src/main/characters.ts - CharacterEngine generates AI commentary via Anthropic API
src/main/logger.ts - Logs console output with timestamps to file

# Shared
src/shared/types.ts - TypeScript interfaces for messages, conversations, IPC events, settings

# Native
src/native/ax-reader.swift - macOS accessibility CLI, parses Claude Desktop conversation tree

# Preload
src/preload/index.ts - Context-isolated IPC bridge for renderer process
src/preload/index.d.ts - Type declarations for window.api global

# Characters
src/characters/index.ts - Character config exports (Waldorf, Statler, Dave presets)
src/characters/waldorf.ts - Waldorf config: grumpy critic, savage one-liner roasts
src/characters/statler.ts - Statler config: comedy partner, builds on setups, punchlines
src/characters/dave.ts - Dave config: deprecated AI, insider knowledge roaster

# Renderer
src/renderer/src/main.tsx - React root entry, wraps App in ErrorBoundary
src/renderer/src/App.tsx - Main UI container, manages state and renders components

# Renderer — Components
src/renderer/src/components/CommentBubble.tsx - Single comment bubble with avatar, alternates left/right
src/renderer/src/components/CommentList.tsx - Scrollable comment feed with smooth animations
src/renderer/src/components/NowShowingBanner.tsx - Two-phase banner: title then roast with auto-dismiss
src/renderer/src/components/SettingsDrawer.tsx - Settings panel for character enable/disable/edit
src/renderer/src/components/CharacterCard.tsx - Edit card for character config, custom character support
src/renderer/src/components/TheatreFrame.tsx - Theatre-themed frame with curtain/railing SVG decorations
src/renderer/src/components/ErrorBoundary.tsx - React error boundary catches and logs render errors

# Renderer — Hooks
src/renderer/src/hooks/useComments.ts - Subscribes to comment:new IPC events from main
src/renderer/src/hooks/useNowShowing.ts - Subscribes to now-showing:update IPC events
src/renderer/src/hooks/useSettings.ts - Loads/saves settings from/to main process storage

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
