# Phase 1: Foundation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prove that Peanut Gallery can read live conversation messages from Claude Desktop via macOS Accessibility APIs — parsed messages appear in the Electron dev console.

**Architecture:** Electron app (electron-vite + React + TS) spawns a compiled Swift CLI as a child process. The Swift CLI uses macOS AXUIElement APIs to read Claude Desktop's accessibility tree and emits structured JSON via stdout. A TypeScript bridge class manages the child process lifecycle and exposes an async API.

**Tech Stack:** Electron 39+, electron-vite 5, React 19, TypeScript 5, Swift 6 (single file compiled with swiftc), Tailwind CSS v4

---

### Task 1: Scaffold Electron Project

Since `npm create @quick-start/electron` is interactive and can't be automated cleanly, we'll manually create the project from the react-ts template files.

**Files:**

- Create: `package.json`
- Create: `electron.vite.config.ts`
- Create: `tsconfig.json`
- Create: `tsconfig.node.json`
- Create: `tsconfig.web.json`
- Create: `eslint.config.mjs`
- Create: `.gitignore`
- Create: `.prettierrc.yaml`
- Create: `.prettierignore`
- Create: `.editorconfig`
- Create: `electron-builder.yml`
- Create: `build/entitlements.mac.plist`
- Create: `build/icon.png` (placeholder — copy from template)
- Create: `resources/icon.png` (placeholder — copy from template)
- Create: `src/main/index.ts`
- Create: `src/preload/index.ts`
- Create: `src/preload/index.d.ts`
- Create: `src/renderer/index.html`
- Create: `src/renderer/src/main.tsx`
- Create: `src/renderer/src/App.tsx`
- Create: `src/renderer/src/env.d.ts`
- Create: `src/renderer/src/assets/main.css`

**Step 1: Create all project files from the electron-vite react-ts template**

`package.json` — note `name` is `peanut-gallery`, React 19 (what the template uses), and we add `build:swift` script:

```json
{
  "name": "peanut-gallery",
  "version": "0.1.0",
  "description": "AI heckler commentary for live chat conversations",
  "main": "./out/main/index.js",
  "author": "",
  "homepage": "https://github.com/user/peanut-gallery",
  "scripts": {
    "format": "prettier --write .",
    "lint": "eslint --cache .",
    "typecheck:node": "tsc --noEmit -p tsconfig.node.json --composite false",
    "typecheck:web": "tsc --noEmit -p tsconfig.web.json --composite false",
    "typecheck": "npm run typecheck:node && npm run typecheck:web",
    "start": "electron-vite preview",
    "dev": "electron-vite dev",
    "build": "npm run typecheck && electron-vite build",
    "build:swift": "bash scripts/build-swift.sh",
    "postinstall": "electron-builder install-app-deps && npm run build:swift",
    "build:mac": "electron-vite build && electron-builder --mac"
  },
  "dependencies": {
    "@electron-toolkit/preload": "^3.0.2",
    "@electron-toolkit/utils": "^4.0.0"
  },
  "devDependencies": {
    "@electron-toolkit/eslint-config-prettier": "^3.0.0",
    "@electron-toolkit/eslint-config-ts": "^3.1.0",
    "@electron-toolkit/tsconfig": "^2.0.0",
    "@types/node": "^22.19.1",
    "@types/react": "^19.2.7",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^5.1.1",
    "electron": "^39.2.6",
    "electron-builder": "^26.0.12",
    "electron-vite": "^5.0.0",
    "eslint": "^9.39.1",
    "eslint-plugin-react": "^7.37.5",
    "eslint-plugin-react-hooks": "^7.0.1",
    "eslint-plugin-react-refresh": "^0.4.24",
    "prettier": "^3.7.4",
    "react": "^19.2.1",
    "react-dom": "^19.2.1",
    "typescript": "^5.9.3",
    "vite": "^7.2.6"
  }
}
```

`electron.vite.config.ts`:

```ts
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react()],
  },
})
```

`tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }]
}
```

`tsconfig.node.json`:

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.node.json",
  "include": ["electron.vite.config.*", "src/main/**/*", "src/preload/**/*"],
  "compilerOptions": {
    "composite": true,
    "types": ["electron-vite/node"]
  }
}
```

`tsconfig.web.json`:

```json
{
  "extends": "@electron-toolkit/tsconfig/tsconfig.web.json",
  "include": [
    "src/renderer/src/env.d.ts",
    "src/renderer/src/**/*",
    "src/renderer/src/**/*.tsx",
    "src/preload/*.d.ts"
  ],
  "compilerOptions": {
    "composite": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@renderer/*": ["src/renderer/src/*"]
    }
  }
}
```

`eslint.config.mjs`:

```js
import { defineConfig } from 'eslint/config'
import tseslint from '@electron-toolkit/eslint-config-ts'
import eslintConfigPrettier from '@electron-toolkit/eslint-config-prettier'
import eslintPluginReact from 'eslint-plugin-react'
import eslintPluginReactHooks from 'eslint-plugin-react-hooks'
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh'

export default defineConfig(
  { ignores: ['**/node_modules', '**/dist', '**/out'] },
  tseslint.configs.recommended,
  eslintPluginReact.configs.flat.recommended,
  eslintPluginReact.configs.flat['jsx-runtime'],
  {
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh,
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
    },
  },
  eslintConfigPrettier,
)
```

`.gitignore`:

```
node_modules
dist
out
.DS_Store
.eslintcache
*.log*
resources/ax-reader
```

Note: `resources/ax-reader` is the compiled Swift binary — should not be committed.

`.prettierrc.yaml`:

```yaml
singleQuote: true
semi: false
printWidth: 100
```

`.prettierignore`:

```
out
dist
pnpm-lock.yaml
```

`.editorconfig`:

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_size = 2
indent_style = space
insert_final_newline = true
trim_trailing_whitespace = true
```

`electron-builder.yml` — customized for Peanut Gallery (macOS only, accessibility entitlement):

```yaml
appId: com.peanutgallery.app
productName: Peanut Gallery
directories:
  buildResources: build
files:
  - '!**/.vscode/*'
  - '!src/*'
  - '!electron.vite.config.{js,ts,mjs,cjs}'
  - '!{.eslintcache,eslint.config.mjs,.prettierignore,.prettierrc.yaml,CHANGELOG.md,README.md}'
  - '!{.env,.env.*,.npmrc,pnpm-lock.yaml}'
  - '!{tsconfig.json,tsconfig.node.json,tsconfig.web.json}'
asarUnpack:
  - 'resources/**'
mac:
  entitlementsInherit: build/entitlements.mac.plist
  notarize: false
dmg:
  artifactName: ${name}-${version}.${ext}
npmRebuild: false
```

`build/entitlements.mac.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>com.apple.security.cs.allow-jit</key>
    <true/>
    <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
    <true/>
    <key>com.apple.security.cs.allow-dyld-environment-variables</key>
    <true/>
  </dict>
</plist>
```

For `build/icon.png` and `resources/icon.png`: create a simple 512x512 placeholder PNG. We can use a 1x1 pixel PNG as a placeholder — electron-builder won't fail on it during dev.

`src/main/index.ts` — standard electron-vite template entry:

```ts
import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.peanutgallery.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
```

`src/preload/index.ts`:

```ts
import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
```

`src/preload/index.d.ts`:

```ts
import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI
    api: unknown
  }
}
```

`src/renderer/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Peanut Gallery</title>
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/renderer/src/env.d.ts`:

```ts
/// <reference types="vite/client" />
```

`src/renderer/src/main.tsx`:

```tsx
import './assets/main.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/renderer/src/App.tsx`:

```tsx
function App(): React.JSX.Element {
  return (
    <div style={{ padding: 40, fontFamily: 'system-ui' }}>
      <h1>Peanut Gallery</h1>
      <p>Phase 1: Check the dev console for accessibility data.</p>
    </div>
  )
}

export default App
```

`src/renderer/src/assets/main.css`:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}
```

**Step 2: Create project directories**

```bash
mkdir -p src/native src/characters src/shared scripts
```

**Step 3: Install dependencies**

```bash
npm install
```

Expected: installs all dependencies, runs `postinstall` which runs `electron-builder install-app-deps` and `build:swift`. The `build:swift` will fail because `scripts/build-swift.sh` doesn't exist yet — that's OK, we'll create it in Task 2.

To avoid the postinstall failure, create a placeholder `scripts/build-swift.sh` first:

```bash
#!/bin/bash
echo "Swift build: skipped (no source yet)"
```

Make it executable: `chmod +x scripts/build-swift.sh`

**Step 4: Verify dev mode works**

Run: `npm run dev`

Expected: Electron window opens showing "Peanut Gallery" heading and "Phase 1: Check the dev console" text. Close the window.

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: scaffold electron-vite project with React + TypeScript"
```

---

### Task 2: Swift Build Script

**Files:**

- Modify: `scripts/build-swift.sh`

**Step 1: Write the build script**

`scripts/build-swift.sh`:

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SRC="$PROJECT_DIR/src/native/ax-reader.swift"
OUT="$PROJECT_DIR/resources/ax-reader"

if [ ! -f "$SRC" ]; then
  echo "Swift source not found at $SRC — skipping build"
  exit 0
fi

echo "Compiling Swift accessibility helper..."
swiftc -framework Cocoa -framework ApplicationServices -O -o "$OUT" "$SRC"
echo "Built: $OUT"
```

**Step 2: Verify it skips gracefully**

Run: `bash scripts/build-swift.sh`

Expected: prints "Swift source not found ... — skipping build" and exits 0.

**Step 3: Commit**

```bash
git add scripts/build-swift.sh
git commit -m "feat: add Swift helper build script"
```

---

### Task 3: Shared Types

**Files:**

- Create: `src/shared/types.ts`

**Step 1: Define the shared types**

These types are used by both the Swift bridge (main process) and eventually the renderer.

`src/shared/types.ts`:

```ts
export interface Message {
  role: 'user' | 'assistant'
  text: string
  timestamp: string | null
  index: number
}

export interface Conversation {
  app: string
  pid: number
  title: string
  messages: Message[]
}

export interface AppInfo {
  name: string
  pid: number
  bundleIdentifier: string
}

export interface AXResponse {
  type: 'apps' | 'conversation' | 'error'
}

export interface AppsResponse extends AXResponse {
  type: 'apps'
  apps: AppInfo[]
}

export interface ConversationResponse extends AXResponse {
  type: 'conversation'
  app: string
  pid: number
  title: string
  messages: Message[]
}

export interface ErrorResponse extends AXResponse {
  type: 'error'
  code: string
  message: string
}

export type SwiftResponse = AppsResponse | ConversationResponse | ErrorResponse
```

**Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit -p tsconfig.node.json --composite false`

Expected: no errors (the shared types file is included via `src/main/**/*` glob in tsconfig.node.json). Note: `src/shared/` is not explicitly in the include — we need to add it.

If it fails because `src/shared/` isn't included, add `"src/shared/**/*"` to the `include` array in `tsconfig.node.json`.

**Step 3: Commit**

```bash
git add src/shared/types.ts tsconfig.node.json
git commit -m "feat: add shared TypeScript types for Swift bridge communication"
```

---

### Task 4: Swift Accessibility Helper

**Files:**

- Create: `src/native/ax-reader.swift`

This is the largest and riskiest task. The Swift file implements:

1. JSON stdin/stdout communication loop
2. `list-apps` command
3. `read-conversation` command with Claude Desktop parser
4. Accessibility permission check
5. `ConversationParser` protocol

**Step 1: Write the Swift helper**

`src/native/ax-reader.swift`:

```swift
import Cocoa
import ApplicationServices

// MARK: - Data Types

struct Message: Codable {
    let role: String
    let text: String
    let timestamp: String?
    let index: Int
}

struct ConversationResult: Codable {
    let type: String
    let app: String
    let pid: Int32
    let title: String
    let messages: [Message]
}

struct AppInfo: Codable {
    let name: String
    let pid: Int32
    let bundleIdentifier: String
}

struct AppsResult: Codable {
    let type: String
    let apps: [AppInfo]
}

struct ErrorResult: Codable {
    let type: String
    let code: String
    let message: String
}

struct Command: Codable {
    let command: String
    let pid: Int32?
}

// MARK: - JSON Helpers

func emit<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = []
    if let data = try? encoder.encode(value),
       let json = String(data: data, encoding: .utf8) {
        print(json)
        fflush(stdout)
    }
}

func emitError(code: String, message: String) {
    emit(ErrorResult(type: "error", code: code, message: message))
}

// MARK: - Accessibility Helpers

func getAXAttribute(_ element: AXUIElement, _ attribute: String) -> AnyObject? {
    var value: AnyObject?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    return result == .success ? value : nil
}

func getAXChildren(_ element: AXUIElement) -> [AXUIElement] {
    guard let children = getAXAttribute(element, kAXChildrenAttribute) as? [AXUIElement] else {
        return []
    }
    return children
}

func getAXRole(_ element: AXUIElement) -> String? {
    return getAXAttribute(element, kAXRoleAttribute) as? String
}

func getAXTitle(_ element: AXUIElement) -> String? {
    return getAXAttribute(element, kAXTitleAttribute) as? String
}

func getAXValue(_ element: AXUIElement) -> String? {
    return getAXAttribute(element, kAXValueAttribute) as? String
}

func getAXDescription(_ element: AXUIElement) -> String? {
    return getAXAttribute(element, kAXDescriptionAttribute) as? String
}

func getDOMIdentifier(_ element: AXUIElement) -> String? {
    return getAXAttribute(element, "AXDOMIdentifier" as CFString) as? String
}

func getDOMClassList(_ element: AXUIElement) -> [String] {
    guard let classList = getAXAttribute(element, "AXDOMClassList" as CFString) as? [String] else {
        return []
    }
    return classList
}

func hasClass(_ element: AXUIElement, _ className: String) -> Bool {
    return getDOMClassList(element).contains(className)
}

func hasClassContaining(_ element: AXUIElement, _ substring: String) -> Bool {
    return getDOMClassList(element).contains { $0.contains(substring) }
}

// MARK: - ConversationParser Protocol

protocol ConversationParser {
    static var bundleIdentifier: String { get }
    static var appName: String { get }
    func parseConversation(from element: AXUIElement, pid: Int32) -> ConversationResult?
}

// MARK: - Claude Desktop Parser

struct ClaudeDesktopParser: ConversationParser {
    static let bundleIdentifier = "com.anthropic.claudefordesktop"
    static let appName = "Claude"

    func parseConversation(from appElement: AXUIElement, pid: Int32) -> ConversationResult? {
        // Step 1: Find AXWindow
        guard let windows = getAXAttribute(appElement, kAXWindowsAttribute) as? [AXUIElement],
              let mainWindow = windows.first else {
            emitError(code: "no_window", message: "No windows found for Claude Desktop")
            return nil
        }

        // Step 2: Find AXWebArea with non-empty title (the conversation web area)
        guard let webArea = findConversationWebArea(in: mainWindow) else {
            emitError(code: "no_webarea", message: "Could not find conversation WebArea in Claude Desktop")
            return nil
        }

        // Extract title
        let rawTitle = getAXTitle(webArea) ?? ""
        let title = rawTitle.hasSuffix(" - Claude")
            ? String(rawTitle.dropLast(" - Claude".count))
            : rawTitle

        // Step 3: Find #main-content
        guard let mainContent = findElementByDOMId(in: webArea, id: "main-content") else {
            emitError(code: "no_main_content", message: "Could not find #main-content element")
            return nil
        }

        // Step 4: Find .overflow-y-scroll (the scrollable message list)
        guard let scrollArea = findElementWithClassContaining(in: mainContent, substring: "overflow-y-scroll") else {
            emitError(code: "no_scroll_area", message: "Could not find scrollable message area (.overflow-y-scroll)")
            return nil
        }

        // Step 5: Parse messages
        let messageGroups = getAXChildren(scrollArea)
        var messages: [Message] = []
        var index = 0

        for group in messageGroups {
            if let message = parseUserMessage(from: group, index: index) {
                messages.append(message)
                index += 1
            } else if let message = parseAssistantMessage(from: group, index: index) {
                messages.append(message)
                index += 1
            }
        }

        return ConversationResult(
            type: "conversation",
            app: ClaudeDesktopParser.appName,
            pid: pid,
            title: title,
            messages: messages
        )
    }

    // MARK: - Tree Navigation

    private func findConversationWebArea(in element: AXUIElement) -> AXUIElement? {
        // Recursively search for AXWebArea with a non-empty title
        let role = getAXRole(element)
        if role == "AXWebArea" {
            let title = getAXTitle(element) ?? ""
            if !title.isEmpty {
                return element
            }
        }
        for child in getAXChildren(element) {
            if let found = findConversationWebArea(in: child) {
                return found
            }
        }
        return nil
    }

    private func findElementByDOMId(in element: AXUIElement, id: String) -> AXUIElement? {
        if getDOMIdentifier(element) == id {
            return element
        }
        for child in getAXChildren(element) {
            if let found = findElementByDOMId(in: child, id: id) {
                return found
            }
        }
        return nil
    }

    private func findElementWithClassContaining(in element: AXUIElement, substring: String) -> AXUIElement? {
        if hasClassContaining(element, substring) {
            return element
        }
        for child in getAXChildren(element) {
            if let found = findElementWithClassContaining(in: child, substring: substring) {
                return found
            }
        }
        return nil
    }

    // MARK: - Message Parsing

    private func descendantHasClassContaining(_ element: AXUIElement, _ substring: String) -> Bool {
        if hasClassContaining(element, substring) { return true }
        for child in getAXChildren(element) {
            if descendantHasClassContaining(child, substring) { return true }
        }
        return false
    }

    private func parseUserMessage(from group: AXUIElement, index: Int) -> Message? {
        guard descendantHasClassContaining(group, "font-user-message") else { return nil }

        let text = extractTextFromElement(group)
        let timestamp = extractTimestamp(after: group)

        return Message(role: "user", text: text, timestamp: timestamp, index: index)
    }

    private func parseAssistantMessage(from group: AXUIElement, index: Int) -> Message? {
        guard descendantHasClassContaining(group, "font-claude-response") else { return nil }

        // Find the row-start-2 section (the displayed response, not thinking)
        var text = ""
        if let responseSection = findElementWithClassContaining(in: group, substring: "row-start-2") {
            text = extractResponseText(from: responseSection)
        } else {
            // Fallback: extract all text from font-claude-response-body elements
            text = extractTextFromElement(group)
        }

        let timestamp = extractTimestamp(after: group)

        return Message(role: "assistant", text: text, timestamp: timestamp, index: index)
    }

    private func extractResponseText(from section: AXUIElement) -> String {
        // Find all font-claude-response-body groups and concatenate their text
        var parts: [String] = []
        collectResponseBodyText(from: section, into: &parts)
        return parts.joined(separator: "\n")
    }

    private func collectResponseBodyText(from element: AXUIElement, into parts: inout [String]) {
        if hasClassContaining(element, "font-claude-response-body") {
            let text = collectStaticText(from: element)
            if !text.isEmpty {
                parts.append(text)
            }
            return
        }
        for child in getAXChildren(element) {
            collectResponseBodyText(from: child, into: &parts)
        }
    }

    private func extractTextFromElement(_ element: AXUIElement) -> String {
        return collectStaticText(from: element)
    }

    private func collectStaticText(from element: AXUIElement) -> String {
        let role = getAXRole(element)
        if role == "AXStaticText" {
            return getAXValue(element) ?? ""
        }
        var parts: [String] = []
        for child in getAXChildren(element) {
            let childText = collectStaticText(from: child)
            if !childText.isEmpty {
                parts.append(childText)
            }
        }
        return parts.joined(separator: "")
    }

    private func extractTimestamp(after element: AXUIElement) -> String? {
        // Timestamps are in a sibling group with desc="Message actions"
        // This is a simplification — in practice we'd need to look at the parent's children
        // For Phase 1, we skip timestamps (they're optional)
        return nil
    }
}

// MARK: - App Discovery

func listApps() -> AppsResult {
    let workspace = NSWorkspace.shared
    let apps = workspace.runningApplications
        .filter { $0.activationPolicy == .regular }
        .compactMap { app -> AppInfo? in
            guard let name = app.localizedName,
                  let bundleId = app.bundleIdentifier else { return nil }
            return AppInfo(
                name: name,
                pid: app.processIdentifier,
                bundleIdentifier: bundleId
            )
        }
    return AppsResult(type: "apps", apps: apps)
}

// MARK: - Main

func main() {
    // Check accessibility permissions
    if !AXIsProcessTrusted() {
        emitError(
            code: "accessibility_denied",
            message: "Accessibility permission not granted. Go to System Settings > Privacy & Security > Accessibility and add this app."
        )
        // Don't exit — the parent process may want to prompt the user and retry
    }

    let parsers: [String: ConversationParser] = [
        ClaudeDesktopParser.bundleIdentifier: ClaudeDesktopParser()
    ]

    // Read commands from stdin
    while let line = readLine() {
        guard let data = line.data(using: .utf8),
              let command = try? JSONDecoder().decode(Command.self, from: data) else {
            emitError(code: "invalid_command", message: "Could not parse command: \(line)")
            continue
        }

        switch command.command {
        case "list-apps":
            emit(listApps())

        case "read-conversation":
            guard let pid = command.pid else {
                emitError(code: "missing_pid", message: "read-conversation requires a pid field")
                continue
            }

            let appElement = AXUIElementCreateApplication(pid)

            // Find which parser to use by matching bundle identifier
            let workspace = NSWorkspace.shared
            let runningApp = workspace.runningApplications.first { $0.processIdentifier == pid }
            let bundleId = runningApp?.bundleIdentifier ?? ""

            if let parser = parsers[bundleId] {
                if let conversation = parser.parseConversation(from: appElement, pid: pid) {
                    emit(conversation)
                }
                // Errors are emitted by the parser itself
            } else {
                emitError(
                    code: "unsupported_app",
                    message: "No parser available for \(runningApp?.localizedName ?? "unknown") (\(bundleId))"
                )
            }

        case "stop":
            break

        default:
            emitError(code: "unknown_command", message: "Unknown command: \(command.command)")
        }
    }
}

main()
```

**Step 2: Compile and verify**

Run: `bash scripts/build-swift.sh`

Expected: prints "Compiling Swift accessibility helper..." then "Built: .../resources/ax-reader". Exit code 0.

**Step 3: Smoke test the binary directly**

Run: `echo '{"command": "list-apps"}' | ./resources/ax-reader`

Expected: JSON output listing running apps (may include an accessibility_denied error first if permissions haven't been granted). You should see a JSON line with `"type": "apps"` and an array of running applications.

If you get the accessibility_denied error, grant permission:

1. Open System Settings → Privacy & Security → Accessibility
2. Add Terminal (or whatever runs the command)
3. Re-run the command

**Step 4: Test read-conversation (requires Claude Desktop running)**

Find Claude Desktop's PID: `pgrep -f "Claude"` (or use the PID from list-apps output).

Run: `echo '{"command": "read-conversation", "pid": <PID>}' | ./resources/ax-reader`

Expected: JSON with `"type": "conversation"`, the conversation title, and an array of messages with correct roles and text.

**Step 5: Commit**

```bash
git add src/native/ax-reader.swift
git commit -m "feat: implement Swift accessibility helper for Claude Desktop"
```

---

### Task 5: Swift Bridge

**Files:**

- Create: `src/main/swift-bridge.ts`

**Step 1: Implement the bridge**

`src/main/swift-bridge.ts`:

```ts
import { spawn, ChildProcess } from 'child_process'
import { join } from 'path'
import { EventEmitter } from 'events'
import { is } from '@electron-toolkit/utils'
import type {
  SwiftResponse,
  AppsResponse,
  ConversationResponse,
  AppInfo,
  Conversation,
} from '../shared/types'

export class SwiftBridgeError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message)
    this.name = 'SwiftBridgeError'
  }
}

export class SwiftBridge extends EventEmitter {
  private process: ChildProcess | null = null
  private buffer: string = ''
  private pendingResolve: ((response: SwiftResponse) => void) | null = null
  private pendingReject: ((error: Error) => void) | null = null

  private getBinaryPath(): string {
    if (is.dev) {
      return join(process.cwd(), 'resources', 'ax-reader')
    }
    return join(process.resourcesPath, 'ax-reader')
  }

  async start(): Promise<void> {
    const binaryPath = this.getBinaryPath()
    this.process = spawn(binaryPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.process.stdout!.on('data', (data: Buffer) => {
      this.buffer += data.toString()
      this.processBuffer()
    })

    this.process.stderr!.on('data', (data: Buffer) => {
      console.error('[ax-reader stderr]', data.toString())
    })

    this.process.on('exit', (code) => {
      console.log(`[ax-reader] exited with code ${code}`)
      if (this.pendingReject) {
        this.pendingReject(new Error(`Swift helper exited unexpectedly with code ${code}`))
        this.pendingResolve = null
        this.pendingReject = null
      }
      this.emit('exit', code)
    })

    this.process.on('error', (err) => {
      console.error('[ax-reader] process error:', err)
      if (this.pendingReject) {
        this.pendingReject(err)
        this.pendingResolve = null
        this.pendingReject = null
      }
      this.emit('error', err)
    })
  }

  private processBuffer(): void {
    const lines = this.buffer.split('\n')
    // Keep the last incomplete line in the buffer
    this.buffer = lines.pop() || ''

    for (const line of lines) {
      if (!line.trim()) continue
      try {
        const response = JSON.parse(line) as SwiftResponse
        if (response.type === 'error' && this.pendingReject) {
          const err = response as { code: string; message: string }
          this.pendingReject(new SwiftBridgeError(err.code, err.message))
          this.pendingResolve = null
          this.pendingReject = null
        } else if (this.pendingResolve) {
          this.pendingResolve(response)
          this.pendingResolve = null
          this.pendingReject = null
        }
      } catch (e) {
        console.error('[ax-reader] Failed to parse JSON:', line, e)
      }
    }
  }

  private sendCommand(command: object): Promise<SwiftResponse> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        reject(new Error('Swift helper not started'))
        return
      }
      this.pendingResolve = resolve
      this.pendingReject = reject
      const json = JSON.stringify(command) + '\n'
      this.process.stdin.write(json)
    })
  }

  async listApps(): Promise<AppInfo[]> {
    const response = (await this.sendCommand({ command: 'list-apps' })) as AppsResponse
    return response.apps
  }

  async readConversation(pid: number): Promise<Conversation> {
    const response = (await this.sendCommand({
      command: 'read-conversation',
      pid,
    })) as ConversationResponse
    return {
      app: response.app,
      pid: response.pid,
      title: response.title,
      messages: response.messages,
    }
  }

  destroy(): void {
    if (this.process) {
      this.process.stdin?.end()
      this.process.kill()
      this.process = null
    }
  }
}
```

**Step 2: Verify typecheck passes**

Run: `npx tsc --noEmit -p tsconfig.node.json --composite false`

Expected: no errors.

**Step 3: Commit**

```bash
git add src/main/swift-bridge.ts
git commit -m "feat: implement Swift bridge for main process <-> ax-reader communication"
```

---

### Task 6: Wire Up Main Process

**Files:**

- Modify: `src/main/index.ts`

**Step 1: Add Swift bridge integration to main process**

Modify `src/main/index.ts` — add the Swift bridge startup after `app.whenReady()`:

```ts
import { app, shell, BrowserWindow, dialog } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { SwiftBridge, SwiftBridgeError } from './swift-bridge'

const bridge = new SwiftBridge()

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function startAccessibilityReader(): Promise<void> {
  try {
    await bridge.start()
    console.log('[PeanutGallery] Swift bridge started')

    // List running apps
    const apps = await bridge.listApps()
    console.log('[PeanutGallery] Running apps:', JSON.stringify(apps, null, 2))

    // Look for Claude Desktop
    const claudeApp = apps.find((a) => a.bundleIdentifier === 'com.anthropic.claudefordesktop')
    if (!claudeApp) {
      console.log('[PeanutGallery] Claude Desktop not found among running apps')
      return
    }

    console.log(
      `[PeanutGallery] Found Claude Desktop (PID ${claudeApp.pid}), reading conversation...`,
    )

    // Read the current conversation
    const conversation = await bridge.readConversation(claudeApp.pid)
    console.log('[PeanutGallery] Conversation:', JSON.stringify(conversation, null, 2))
  } catch (err) {
    if (err instanceof SwiftBridgeError && err.code === 'accessibility_denied') {
      console.error('[PeanutGallery] Accessibility permission denied')
      dialog
        .showMessageBox({
          type: 'warning',
          title: 'Accessibility Permission Required',
          message:
            'Peanut Gallery needs Accessibility permission to read chat conversations.\n\n' +
            'Please go to System Settings → Privacy & Security → Accessibility and grant permission to Peanut Gallery.',
          buttons: ['Open System Settings', 'Later'],
          defaultId: 0,
        })
        .then((result) => {
          if (result.response === 0) {
            shell.openExternal(
              'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
            )
          }
        })
    } else {
      console.error('[PeanutGallery] Error:', err)
    }
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.peanutgallery.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()
  startAccessibilityReader()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  bridge.destroy()
})
```

**Step 2: Verify typecheck passes**

Run: `npm run typecheck`

Expected: no errors.

**Step 3: Integration test (manual)**

Prerequisites: Claude Desktop is running with an active conversation.

Run: `npm run dev`

Expected:

1. Electron window opens with "Peanut Gallery" placeholder UI
2. In the dev console (F12 / Cmd+Option+I), you should see:
   - `[PeanutGallery] Swift bridge started`
   - `[PeanutGallery] Running apps:` followed by JSON array of apps
   - `[PeanutGallery] Found Claude Desktop (PID ...)`
   - `[PeanutGallery] Conversation:` followed by JSON with title and messages array

If accessibility is denied, you'll see the permission dialog instead. Grant permission in System Settings, restart the app, and re-test.

**Step 4: Commit**

```bash
git add src/main/index.ts
git commit -m "feat: wire Swift bridge into main process, log Claude Desktop messages on startup"
```

---

### Task 7: Add Tailwind CSS v4

This is an optional but recommended step — Tailwind is needed for Phase 3 UI work and is trivial to add now. We set it up but don't change any UI.

**Files:**

- Modify: `package.json` (add tailwindcss + @tailwindcss/vite)
- Modify: `electron.vite.config.ts` (add tailwind vite plugin)
- Modify: `src/renderer/src/assets/main.css` (add tailwind import)

**Step 1: Install Tailwind CSS v4**

Run: `npm install tailwindcss @tailwindcss/vite`

**Step 2: Add Tailwind Vite plugin to renderer config**

`electron.vite.config.ts`:

```ts
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
      },
    },
    plugins: [react(), tailwindcss()],
  },
})
```

**Step 3: Add Tailwind import to CSS**

`src/renderer/src/assets/main.css`:

```css
@import 'tailwindcss';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
}
```

**Step 4: Verify it works**

Run: `npm run dev`

Expected: App opens without errors. Tailwind utility classes are now available in the renderer.

**Step 5: Commit**

```bash
git add package.json package-lock.json electron.vite.config.ts src/renderer/src/assets/main.css
git commit -m "feat: add Tailwind CSS v4 to renderer"
```

---

## Done Criteria Checklist

After all 7 tasks are complete:

- [ ] `npm run dev` starts the Electron app without errors
- [ ] Swift helper compiles via `npm run build:swift`
- [ ] `list-apps` output appears in dev console with Claude Desktop listed
- [ ] `read-conversation` output appears with correct message roles and text
- [ ] Thinking/reasoning sections are excluded from assistant messages
- [ ] Accessibility denied produces a helpful dialog (not a crash)
- [ ] `npm run typecheck` passes
- [ ] Tailwind CSS is available in the renderer
- [ ] All changes are committed
