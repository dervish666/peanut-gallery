# Changelog

## 0.1.0 — 2025-02-08

First release.

### Features

- Scaffold Electron app with React 18 + TypeScript + Tailwind CSS v4 (`electron-vite`)
- Swift accessibility helper for reading Claude Desktop conversations via AXUIElement APIs
- Swift bridge for main process <-> ax-reader communication
- Message differ with debounce/settling for streaming assistant responses
- Character engine with Waldorf, Statler, and Dave personas (Claude Haiku)
- Character chaining — characters react to each other's commentary
- Overlay UI with speech bubbles, settings panel, and character management
- Enable/disable toggle and delete for custom characters
- Theatre frame UI with curtain SVGs, railing, and macOS vibrancy
- "Now Showing" marquee banner with instant title roast on conversation switch
- Character intro comments when switching conversations
- Multi-monitor support

### Fixes

- Move accessibility permission check to Electron main process
- Trigger commentary on assistant replies, not user messages
- Skip settling on "Thinking..." messages — wait for actual response
- Crash prevention and UI correctness improvements
- Differ stability improvements
- Dead code cleanup

### Tests

- Vitest infrastructure with 38 tests across 3 suites

### Internal

- Shared TypeScript types for all IPC event shapes
- Swift build script (`scripts/build-swift.sh`)
- Architecture documentation in CLAUDE.md
