# Event-Driven Focus Tracking

## Problem

PeanutGallery's overlay window requires manual discovery by the user. With `alwaysOnTop` disabled, users must open Claude Desktop then separately find and open PeanutGallery. The existing 500ms focus-polling approach has lag, race conditions, and breaks when the user clicks the overlay itself.

## Solution

Make PeanutGallery an invisible agent app that appears and disappears alongside Claude Desktop using event-driven focus tracking.

Three changes:

1. **`app.dock.hide()`** — Remove PeanutGallery from Dock and Cmd+Tab. Users never need to find it.
2. **NSWorkspace observer in Swift helper** — Push `app-activated` events to Electron in real time when any app gains focus.
3. **Event handler in Electron** — Show/hide the overlay based on which app activated. Delete the 500ms polling loop.

## Swift Helper Changes

Add an `NSWorkspace.didActivateApplicationNotification` observer at process startup, before the stdin command loop. On each notification, emit an unsolicited JSON line:

```json
{"type": "app-activated", "bundleId": "com.anthropic.claudefordesktop", "pid": 12345}
```

This is a push event — no command/response cycle. The observer runs on the main run loop alongside the existing stdin reader.

Remove the `check-frontmost` command handler (dead code after this change). The `isFrontmost` field on `ConversationResult` can also be removed.

## SwiftBridge Changes

The existing `processBuffer` method only routes responses to the active command. Unsolicited events (no active command) are currently logged as warnings and dropped.

Change `processBuffer` to detect `"type": "app-activated"` responses and emit them as events on the `SwiftBridge` EventEmitter instead of routing to the command queue:

```ts
bridge.on('app-activated', (bundleId: string, pid: number) => { ... })
```

Remove `checkFrontmost()` method and `FrontmostResponse` type (unused after this change).

## Electron Main Process Changes

In `app.whenReady()`:

1. Call `app.dock.hide()` before `createWindow()`.
2. Listen for `bridge.on('app-activated', ...)`:
   - `bundleId === 'com.anthropic.claudefordesktop'` → `mainWindow.showInactive()` + `setAlwaysOnTop(true, 'floating')`. If `claudePid` is null, re-run `listApps()` to discover it and start polling.
   - `bundleId === peanutGalleryBundleId` → no-op (user clicked the overlay).
   - Any other bundle ID → `mainWindow.hide()`.
3. Delete `focusInterval`, `checkingFocus`, the `setInterval` block, and the `clearInterval` in `before-quit`.

## Edge Cases

- **Claude not running at startup**: Overlay stays hidden (`show: false`). Observer fires when Claude eventually opens.
- **Claude quits**: Next app activation hides the overlay. If Claude relaunches, the observer fires and we re-discover its PID via `listApps()`.
- **Overlay clicked**: PeanutGallery's own bundle ID is detected → overlay stays visible.
- **Multiple monitors**: `positionOverlayBesideClaude()` already handles this via cursor position. No change needed.

## Code Removed

- `focusInterval` variable and its `setInterval`/`clearInterval`
- `checkingFocus` flag
- `SwiftBridge.checkFrontmost()` method
- `FrontmostResponse` type from `shared/types.ts`
- `isFrontmost` field from `Conversation` and `ConversationResponse` types
- `check-frontmost` command handler in `ax-reader.swift`
- `FrontmostResult` struct in `ax-reader.swift`
